import type { WorklogEntry, SyncResult, CostlockerBudget } from "~~/app/types";
import type { ServerConfig } from "./config";

const COSTLOCKER_API = "https://api.costlocker.com/graphql";
const COSTLOCKER_REST_API = "https://rest.costlocker.com/api";

function getCostlockerHeaders(config: ServerConfig) {
  if (!config.costlockerApiToken) {
    throw createError({
      statusCode: 400,
      message: "Costlocker API token is missing. Configure it in Settings.",
    });
  }
  return {
    Authorization: `Static ${config.costlockerApiToken}`,
    "Content-Type": "application/json",
  };
}

async function gql<T = any>(
  config: ServerConfig,
  query: string,
  variables?: Record<string, any>,
): Promise<T> {
  const headers = getCostlockerHeaders(config);
  const body = { query, variables };

  let res: { data: T; errors?: Array<{ message: string }> };
  try {
    res = await $fetch<{ data: T; errors?: Array<{ message: string }> }>(
      COSTLOCKER_API,
      { method: "POST", headers, body },
    );
  } catch (err: any) {
    console.error("[Costlocker] Request failed:", { url: COSTLOCKER_API, headers, body, error: err.message });
    throw err;
  }

  const firstError = res.errors?.[0];
  if (firstError) {
    console.error("[Costlocker] GraphQL error:", { url: COSTLOCKER_API, headers, body, error: firstError.message });
    throw createError({
      statusCode: 502,
      message: `Costlocker: ${firstError.message}`,
    });
  }

  return res.data;
}

export async function fetchCostlockerCurrentPersonId(config: ServerConfig): Promise<number> {
  const data = await gql<{ currentPerson: { id: number } }>(
    config,
    "{ currentPerson { id } }",
  );
  return data.currentPerson.id;
}

export async function fetchCostlockerBudgets(config: ServerConfig): Promise<CostlockerBudget[]> {
  const personId = await fetchCostlockerCurrentPersonId(config);

  const body = {
    "7_Resource_Tracking_AvailableAssignments": { tracking: true },
    "7_Lst_Activity": {},
  };

  console.log(`[Costlocker] Fetching available assignments via REST API for person ${personId}`);

  let res: Record<string, any>;
  try {
    res = await $fetch<Record<string, any>>(COSTLOCKER_REST_API, {
      method: "POST",
      headers: {
        Authorization: `Static ${config.costlockerApiToken}`,
        "Content-Type": "application/json",
        "person-id": String(personId),
      },
      body,
    });
  } catch (err: any) {
    console.error("[Costlocker] REST API request failed:", {
      url: COSTLOCKER_REST_API,
      body,
      error: err.message,
    });
    throw err;
  }

  const trackingData = res["7_Resource_Tracking_AvailableAssignments"] || {};
  const items: Array<{
    project_id: string;
    activity_id: string;
    task_id: string | null;
    task_name: string | null;
  }> = trackingData.Items || [];
  const mapProject: Record<string, { name: string; jobid: string; client_id: string }> =
    trackingData.MapProject || {};

  // Activity names from 7_Lst_Activity (keyed by activity id)
  const activityMap: Record<string, any> = typeof res["7_Lst_Activity"] === "object" && res["7_Lst_Activity"] !== null
    ? res["7_Lst_Activity"]
    : {};

  console.log(`[Costlocker] Got ${items.length} assignment items, ${Object.keys(mapProject).length} projects`);

  // Group by project, collect unique activities per project
  const budgetMap = new Map<string, CostlockerBudget>();

  for (const item of items) {
    const projId = item.project_id;
    const proj = mapProject[projId];
    if (!proj) continue;

    // Use project_id as the budget ID (this is what the GraphQL mutation expects)
    const budgetId = Number(projId);

    let budget = budgetMap.get(projId);
    if (!budget) {
      budget = {
        id: budgetId,
        name: `${proj.name} (${proj.jobid})`,
        companyName: "",
        activities: [],
      };
      budgetMap.set(projId, budget);
    }

    const activityId = Number(item.activity_id);
    if (!budget.activities.some(a => a.id === activityId)) {
      const activityData = activityMap[item.activity_id];
      const activityName = activityData?.na || `Activity ${activityId}`;
      budget.activities.push({ id: activityId, name: activityName });
    }
  }

  const result = Array.from(budgetMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  console.log(`[Costlocker] Returning ${result.length} budgets`);
  return result;
}

export async function syncWorklogsToCostlocker(
  config: ServerConfig,
  entries: WorklogEntry[],
): Promise<SyncResult[]> {
  console.log(`[Costlocker] Starting sync of ${entries.length} worklogs`);
  const totalStart = Date.now();

  const personId = await fetchCostlockerCurrentPersonId(config);
  console.log(`[Costlocker] Using person ID: ${personId}`);

  const results: SyncResult[] = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    const label = `${entry.jiraIssueKey} (${entry.date})`;

    if (!entry.costlockerBudgetId || !entry.costlockerActivityId) {
      console.log(`[Costlocker] ${i + 1}/${entries.length} SKIP ${label} — no budget/activity mapped`);
      results.push({
        worklogId: entry.id,
        success: false,
        error: "No Costlocker budget/activity mapped",
      });
      continue;
    }

    // GraphQL duration field — try seconds (scs_tracked in REST API uses seconds)
    const duration = entry.durationSeconds;
    const description = [entry.jiraIssueKey, entry.description]
      .filter(Boolean)
      .join(" - ");
    // Costlocker expects UTC DateTime with Z suffix, e.g. 2026-03-05T09:30:00Z
    let startAt = entry.startTime || `${entry.date}T00:00:00`;
    if (!startAt.endsWith("Z") && !startAt.includes("+")) {
      startAt = `${startAt}Z`;
    }

    const mutation = `mutation CreateTimeEntry($input: [CreateTimeEntryInput!]!) {
      createTimeEntry(input: $input) {
        uuid
      }
    }`;

    const variables = {
      input: [
        {
          assignmentKey: {
            personId,
            taskKey: {
              budgetId: entry.costlockerBudgetId,
              activityId: entry.costlockerActivityId,
            },
          },
          startAt,
          duration,
          description,
        },
      ],
    };

    const body = { query: mutation, variables };
    const syncHeaders = getCostlockerHeaders(config);
    const entryStart = Date.now();
    try {
      const res = await $fetch<{
        data: any;
        errors?: Array<{ message: string }>;
      }>(COSTLOCKER_API, {
        method: "POST",
        headers: syncHeaders,
        body,
      });

      const ms = Date.now() - entryStart;
      const firstErr = res.errors?.[0];
      if (firstErr) {
        console.error(`[Costlocker] ${i + 1}/${entries.length} FAIL ${label} in ${ms}ms — ${firstErr.message}`, { url: COSTLOCKER_API, headers: syncHeaders, body });
        results.push({
          worklogId: entry.id,
          success: false,
          error: firstErr.message,
        });
      } else {
        console.log(`[Costlocker] ${i + 1}/${entries.length} OK ${label} — ${duration}s (${(duration / 3600).toFixed(2)}h), budget=${entry.costlockerBudgetId}, activity=${entry.costlockerActivityId} in ${ms}ms`);
        results.push({ worklogId: entry.id, success: true });
      }
    } catch (err: any) {
      const ms = Date.now() - entryStart;
      console.error(`[Costlocker] ${i + 1}/${entries.length} ERROR ${label} in ${ms}ms — ${err.message}`, { url: COSTLOCKER_API, headers: syncHeaders, body });
      results.push({
        worklogId: entry.id,
        success: false,
        error: err.message || "Unknown error",
      });
    }
  }

  const succeeded = results.filter((r) => r.success).length;
  const failed = results.length - succeeded;
  console.log(`[Costlocker] Sync done: ${succeeded} OK, ${failed} failed in ${Date.now() - totalStart}ms`);

  return results;
}

export async function testCostlockerConnection(config: ServerConfig): Promise<{
  ok: boolean;
  error?: string;
}> {
  try {
    await gql<{
      currentPerson: { id: number; firstName: string; lastName: string };
    }>(config, "{ currentPerson { id firstName lastName } }");
    return { ok: true, error: undefined };
  } catch (err: any) {
    return {
      ok: false,
      error: err.data?.message || err.message || "Connection failed",
    };
  }
}
