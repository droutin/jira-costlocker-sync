export default defineEventHandler(async (event) => {
  const config = getConfigFromHeaders(event)
  return await testCostlockerConnection(config)
})
