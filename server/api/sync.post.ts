import type { WorklogEntry } from '~~/app/types'

export default defineEventHandler(async (event) => {
  const config = getConfigFromHeaders(event)
  const body = await readBody<{ worklogs: WorklogEntry[] }>(event)

  if (!body.worklogs?.length) {
    throw createError({ statusCode: 400, message: 'No worklogs provided' })
  }

  const results = await syncWorklogsToCostlocker(config, body.worklogs)
  const succeeded = results.filter(r => r.success).length
  const failed = results.length - succeeded
  const errors = results
    .filter(r => !r.success && r.error)
    .map(r => ({ worklogId: r.worklogId, error: r.error }))

  return { results, succeeded, failed, errors }
})
