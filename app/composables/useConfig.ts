import type { ProjectMapping } from '~/types'

interface AppConfig {
  jiraApiToken: string
  jiraAccountId: string
  costlockerApiToken: string
}

const CONFIG_KEY = 'jira-costlocker-config'
const MAPPINGS_KEY = 'jira-costlocker-mappings'

export function useConfig() {
  const config = useState<AppConfig>('app-config', () => ({
    jiraApiToken: '',
    jiraAccountId: 'current-user',
    costlockerApiToken: '',
  }))

  const mappings = useState<ProjectMapping[]>('app-mappings', () => [])

  function load() {
    if (import.meta.server) return
    try {
      const raw = localStorage.getItem(CONFIG_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        Object.assign(config.value, parsed)
      }
    }
    catch {}
    try {
      const raw = localStorage.getItem(MAPPINGS_KEY)
      if (raw) mappings.value = JSON.parse(raw)
    }
    catch {}
  }

  function save() {
    if (import.meta.server) return
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config.value))
  }

  function saveMappings() {
    if (import.meta.server) return
    localStorage.setItem(MAPPINGS_KEY, JSON.stringify(mappings.value))
  }

  /** Headers to attach to every server API call */
  function authHeaders(): Record<string, string> {
    const h: Record<string, string> = {}
    if (config.value.jiraApiToken) h['x-app-jira-token'] = config.value.jiraApiToken
    if (config.value.jiraAccountId) h['x-app-jira-account-id'] = config.value.jiraAccountId
    if (config.value.costlockerApiToken) h['x-app-costlocker-token'] = config.value.costlockerApiToken
    return h
  }

  /** Apply project mappings to worklogs */
  function applyMappings(worklogs: { jiraIssueKey: string; costlockerBudgetId?: number; costlockerActivityId?: number }[]) {
    for (const wl of worklogs) {
      const projectKey = wl.jiraIssueKey.split('-')[0]
      const mapping = mappings.value.find(m => m.jiraProjectKey === projectKey)
      if (mapping) {
        wl.costlockerBudgetId = mapping.costlockerBudgetId
        wl.costlockerActivityId = mapping.costlockerActivityId
      }
    }
  }

  return { config, mappings, load, save, saveMappings, authHeaders, applyMappings }
}
