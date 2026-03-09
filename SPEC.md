# Jira to Costlocker Time Log Sync

## Overview

A local-first Nuxt 4 web application that synchronizes time logs (worklogs) one-way from **Jira (STAGIL Timetracker)** to **Costlocker**. There is no login system — each user clones the repo, configures their API keys, and runs the app locally.

## Tech Stack

- **Framework**: Nuxt 4 (Vue 3)
- **UI**: @nuxt/ui v4
- **Runtime**: Bun
- **Language**: TypeScript

## Architecture

```
┌─────────────┐       Nuxt Server API       ┌──────────────┐
│  Nuxt UI    │  ──────────────────────────► │  /api/sync   │
│  Frontend   │  ◄────────────────────────── │  /api/config │
└─────────────┘                              └──────┬───────┘
                                                    │
                                    ┌───────────────┼───────────────┐
                                    ▼                               ▼
                           ┌────────────────┐             ┌─────────────────┐
                           │ Jira/STAGIL    │             │ Costlocker      │
                           │ Timetracker    │             │ GraphQL API     │
                           │ REST API       │             │                 │
                           │ (READ)         │             │ (WRITE)         │
                           └────────────────┘             └─────────────────┘
```

## User Flow

1. User opens the app in browser (`http://localhost:3000`)
2. User enters API configuration (tokens, base URLs) on the settings page — stored in a local `.env` file or runtime config
3. User navigates to the sync page
4. User selects a date range to sync
5. User clicks "Fetch from Jira" — app retrieves worklogs from STAGIL Timetracker
6. User reviews the fetched time entries in a table
7. User clicks "Sync to Costlocker" — app pushes entries to Costlocker
8. App displays sync results (success/failures per entry)

## Pages

### `/` — Sync Dashboard

- Date range picker (from / to)
- "Fetch worklogs" button
- Table showing fetched worklogs with columns:
  - Date
  - Jira issue key
  - Description / work description
  - Duration (hours)
  - Costlocker project (mapped or manual)
  - Status (pending / synced / error)
- "Sync to Costlocker" button
- Sync result summary

### `/settings` — API Configuration

- **Jira / STAGIL Timetracker section**:
  - Base URL (e.g. `https://yourinstance.atlassian.net`)
  - API Token
  - Account email (for Jira auth)
  - Test connection button
- **Costlocker section**:
  - Personal API Token
  - Test connection button
- **Mapping section**:
  - Jira project → Costlocker project mapping table
  - Add / remove mapping rows

## Data Model

### WorklogEntry (internal)

```typescript
interface WorklogEntry {
  id: string                  // internal unique id
  jiraWorklogId: string       // worklog ID from STAGIL Timetracker
  jiraIssueKey: string        // e.g. "PROJ-123"
  jiraIssueSummary: string    // issue title
  date: string                // ISO date "YYYY-MM-DD"
  durationSeconds: number     // time spent in seconds
  description: string         // work description
  author: string              // who logged the time
  costlockerProjectId?: string // mapped Costlocker project
  costlockerTaskId?: string   // mapped Costlocker task
  syncStatus: 'pending' | 'synced' | 'error'
  syncError?: string          // error message if sync failed
}
```

### ProjectMapping

```typescript
interface ProjectMapping {
  jiraProjectKey: string      // e.g. "PROJ"
  costlockerProjectId: string
  costlockerTaskId?: string   // optional default task
}
```

## API Integration

### Source: STAGIL Timetracker REST API

- **Docs**: https://docs.everit.biz/timetracker/rest-api
- **Base URL**: `https://jttp-cloud.everit.biz/timetracker/api/latest/public`
- **Authentication**: `x-everit-api-key` header with API token (created in Timetracker > My Preferences > REST API tab)

#### Required Headers

| Header | Required | Description |
|--------|----------|-------------|
| `x-everit-api-key` | Yes | API token |
| `x-requested-by` | Yes (for POST/PATCH/DELETE) | CSRF protection (can be empty string) |
| `x-timezone` | No | User timezone (e.g. `Europe/Prague`), defaults to UTC |

#### Endpoints

##### POST /report/details — Fetch worklogs by date range (PRIMARY ENDPOINT)

Used to fetch all worklogs in a date range. Returns paginated results with full issue and project context.

**Request body:**

```json
{
  "startDate": "2025-01-01",
  "endDate": "2025-01-31",
  "startAt": 0,
  "maxResults": 50,
  "orderBy": "-worklogStartTime",
  "users": ["accountId"],
  "projects": ["10000"],
  "jql": "project = PROJ",
  "expand": ["PROJECT"]
}
```

All filter fields (`users`, `projects`, `jql`, `groups`, `filters`, `filterBillable`, `reportTagFilter`) are optional.

**Response:**

```json
{
  "total": 120,
  "startAt": 0,
  "maxResults": 50,
  "totalWorkTimeInSeconds": 432000,
  "values": [
    {
      "issue": {
        "id": 10001,
        "key": "PROJ-123",
        "summary": "Issue title",
        "status": { "name": "In Progress" },
        "type": { "name": "Task" }
      },
      "project": {
        "id": "10000",
        "key": "PROJ",
        "name": "My Project"
      },
      "worklog": {
        "id": 155,
        "jiraWorklogId": 230818,
        "description": "Worked on feature",
        "durationInSeconds": 3600,
        "isBillable": true,
        "startTime": "2025-01-15T09:00:00.000Z",
        "author": { "id": "accountId", "name": "John Doe" },
        "worklogTags": [{ "id": 1, "name": "development" }]
      }
    }
  ]
}
```

**orderBy options:** `worklogStartTime`, `worklogCreated`, `worklogTimeSpent`, `worklogUpdated` (prefix with `-` for descending)

##### GET /worklog — Get single worklog

`GET /worklog?worklogId=155` or `GET /worklog?jiraWorklogId=230818`

##### POST /worklog — Create worklog

```json
{
  "issueId": 10001,
  "workDate": "2025-01-15",
  "durationInSeconds": 3600,
  "description": "Work description",
  "workStartTime": "09:00",
  "isBillable": true,
  "worklogTagIds": [1]
}
```

##### PATCH /worklog — Update worklog

##### DELETE /worklog — Delete worklog

##### POST /report/summary — Aggregated report by project/user/component

##### POST /report/fillchecker — Per-user daily time summary

##### GET /tag — List tags | POST /tag — Create tag

#### Error Codes

| Code | Meaning |
|------|---------|
| 400 | Invalid parameters (fieldErrors + additionalErrors) |
| 401 | Unauthorized |
| 479 | Missing Timetracker permissions |
| 567 | Worklog synchronization incomplete |

### Destination: Costlocker GraphQL API

- **Docs**: https://napoveda.costlocker.cz/integrace/api
- **Endpoint**: `https://api.costlocker.com/graphql`
- **Playground**: https://api.costlocker.com/graphql (browser, needs auth)
- **Authentication**: `Authorization: Static {PERSONAL_API_TOKEN}` header

#### Key Concepts

- **Budget** = Project in Costlocker (has `id: Int`, `name`, `company`)
- **Activity** = Task type / role (has `id: Int`, `name`)
- **PersonId** = Current user ID (fetched via `currentPerson { id }`)
- **AssignmentKey** = The combination of `personId` + `taskKey { budgetId, activityId }` that identifies who is logging time to which project/activity

#### Mutation: createTimeEntry

Creates one or more time entries. Takes a **list** of inputs.

```graphql
mutation CreateTimeEntry($input: [CreateTimeEntryInput!]!) {
  createTimeEntry(input: $input) {
    uuid
  }
}
```

**CreateTimeEntryInput:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `assignmentKey` | AssignmentKeyInput | Yes | Who + where |
| `startAt` | DateTime | Yes | Date/time of entry (e.g. `"2025-01-15T00:00:00"`) |
| `duration` | Float | No | Duration in **hours** (e.g. `1.5`) |
| `description` | String | No | Work description |
| `billableOverwrite` | Enum | No | `BILLABLE`, `NON_BILLABLE`, or `NO_OVERWRITE` |

**AssignmentKeyInput:**

| Field | Type | Required |
|-------|------|----------|
| `personId` | Int! | Yes |
| `taskKey` | AssignmentTaskKeyInput | No |

**AssignmentTaskKeyInput:**

| Field | Type | Required |
|-------|------|----------|
| `budgetId` | Int! | Yes |
| `activityId` | Int! | Yes |
| `subtaskId` | Int | No |

#### Queries Used

```graphql
# Get current user ID
{ currentPerson { id firstName lastName } }

# List budgets (projects) — paginated
{
  budgets(sorting: { sortBy: [NAME], direction: ASC }, pagination: { page: 1, pageSize: 500 }) {
    items { id name company { id name } }
  }
}

# List activities (task types) — paginated
{
  activities(pagination: { page: 1, pageSize: 500 }) {
    items { id name }
  }
}
```

## Server API Routes (Nuxt)

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/worklogs` | Fetch worklogs from Timetracker for a given date range (`?from=&to=`) |
| POST | `/api/sync` | Push selected worklogs to Costlocker |
| GET | `/api/costlocker/projects` | List Costlocker projects (for mapping UI) |
| GET | `/api/jira/test` | Test Timetracker connection |
| GET | `/api/costlocker/test` | Test Costlocker connection |
| GET | `/api/mappings` | Get project mappings |
| PUT | `/api/mappings` | Save project mappings |

## Configuration

Stored in `.env` file at project root (gitignored):

```env
NUXT_JIRA_API_TOKEN=your-timetracker-api-token
NUXT_COSTLOCKER_API_TOKEN=your-costlocker-api-token
```

Project mappings stored in a local JSON file (`mappings.json`, gitignored):

```json
[
  {
    "jiraProjectKey": "PROJ",
    "costlockerBudgetId": 12345,
    "costlockerActivityId": 67
  }
]
```

## Error Handling

- Show clear error messages when API tokens are invalid or missing
- Per-entry error reporting during sync (don't stop on first failure)
- Retry individual failed entries

## Out of Scope

- User authentication / multi-user support
- Two-way sync
- Automatic / scheduled sync
- Duplicate detection (user is responsible for not syncing the same range twice)
