import type { WorklogEntry } from '~~/app/types'
import type { ServerConfig } from './config'

const TIMETRACKER_API = 'https://jttp-cloud.everit.biz/timetracker/api/latest/public'

function getHeaders(config: ServerConfig, needsCsrf = false) {
  if (!config.jiraApiToken) {
    throw createError({ statusCode: 400, message: 'Timetracker API token is missing. Configure it in Settings.' })
  }

  const headers: Record<string, string> = {
    'x-everit-api-key': config.jiraApiToken,
    'Content-Type': 'application/json',
  }

  if (needsCsrf) {
    headers['x-requested-by'] = ''
  }

  return headers
}

export async function fetchJiraWorklogs(config: ServerConfig, from: string, to: string): Promise<WorklogEntry[]> {
  if (!config.jiraAccountId) {
    throw createError({ statusCode: 400, message: 'Jira account ID is missing. Configure it in Settings.' })
  }

  const headers = getHeaders(config, true)
  const worklogs: WorklogEntry[] = []
  let startAt = 0
  const maxResults = 50
  const users = [config.jiraAccountId]

  console.log(`[Jira] Fetching worklogs from ${from} to ${to} for user ${config.jiraAccountId}`)
  const totalStart = Date.now()

  // Paginate through all results using the Details Report API
  while (true) {
    const url = `${TIMETRACKER_API}/report/details`
    const body = {
      startDate: from,
      endDate: to,
      startAt,
      maxResults,
      orderBy: '-worklogStartTime',
      users,
    }

    let res: {
      total: number
      startAt: number
      maxResults: number
      values: Array<{
        issue: { id: number; key: string; summary: string }
        project: { id: string; key: string; name: string }
        worklog: {
          id: number
          jiraWorklogId: number
          description: string
          durationInSeconds: number
          isBillable: boolean
          startTime: string
          author: { id: string; name: string }
          worklogTags: Array<{ id: number; name: string }>
        }
      }>
    }

    const pageStart = Date.now()
    try {
      res = await $fetch(url, { method: 'POST', headers, body })
    } catch (err: any) {
      console.error('[Jira] Request failed:', { url, headers, body, error: err.message })
      throw err
    }
    const pageMs = Date.now() - pageStart

    console.log(`[Jira] Page ${Math.floor(startAt / maxResults) + 1}: got ${res.values.length} worklogs (${startAt + 1}-${startAt + res.values.length} of ${res.total}) in ${pageMs}ms`)

    for (const entry of res.values) {
      const date = entry.worklog.startTime?.substring(0, 10) || from
      worklogs.push({
        id: `tt-${entry.worklog.id}`,
        jiraWorklogId: String(entry.worklog.jiraWorklogId),
        jiraIssueKey: entry.issue.key,
        jiraIssueSummary: entry.issue.summary,
        date,
        startTime: entry.worklog.startTime || `${date}T00:00:00`,
        durationSeconds: entry.worklog.durationInSeconds,
        description: entry.worklog.description || '',
        author: entry.worklog.author?.name || 'Unknown',
        syncStatus: 'pending',
      })
    }

    startAt += maxResults
    if (startAt >= res.total) break
  }

  console.log(`[Jira] Done: ${worklogs.length} worklogs fetched in ${Date.now() - totalStart}ms`)
  return worklogs
}

export async function testJiraConnection(config: ServerConfig): Promise<{ ok: boolean; error?: string }> {
  if (!config.jiraApiToken) {
    return { ok: false, error: 'Timetracker API token is missing' }
  }

  const url = `${TIMETRACKER_API}/tag`
  const testHeaders = { 'x-everit-api-key': config.jiraApiToken }
  try {
    await $fetch(url, { headers: testHeaders })
    return { ok: true }
  }
  catch (err: any) {
    console.error('[Jira] Test connection failed:', { url, headers: testHeaders, error: err.message })
    return { ok: false, error: err.data?.message || err.message || 'Connection failed' }
  }
}
