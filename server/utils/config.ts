import type { H3Event } from 'h3'

export interface ServerConfig {
  jiraApiToken: string
  jiraAccountId: string
  costlockerApiToken: string
}

/** Extract app config from request headers sent by the client */
export function getConfigFromHeaders(event: H3Event): ServerConfig {
  return {
    jiraApiToken: getHeader(event, 'x-app-jira-token') || '',
    jiraAccountId: getHeader(event, 'x-app-jira-account-id') || '',
    costlockerApiToken: getHeader(event, 'x-app-costlocker-token') || '',
  }
}
