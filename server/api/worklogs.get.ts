export default defineEventHandler(async (event) => {
  const config = getConfigFromHeaders(event)
  const query = getQuery(event)
  const from = String(query.from || '')
  const to = String(query.to || '')

  if (!from || !to) {
    throw createError({ statusCode: 400, message: 'Missing "from" and "to" query parameters (YYYY-MM-DD)' })
  }

  return await fetchJiraWorklogs(config, from, to)
})
