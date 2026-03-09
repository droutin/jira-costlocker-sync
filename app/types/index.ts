export interface WorklogEntry {
  id: string
  jiraWorklogId: string
  jiraIssueKey: string
  jiraIssueSummary: string
  date: string
  startTime: string
  durationSeconds: number
  description: string
  author: string
  costlockerBudgetId?: number
  costlockerActivityId?: number
  syncStatus: 'pending' | 'synced' | 'error'
  syncError?: string
}

export interface ProjectMapping {
  jiraProjectKey: string
  costlockerBudgetId: number
  costlockerActivityId: number
}

export interface SyncResult {
  worklogId: string
  success: boolean
  error?: string
}

export interface CostlockerBudget {
  id: number
  name: string
  companyName: string
  activities: CostlockerActivity[]
}

export interface CostlockerActivity {
  id: number
  name: string
}
