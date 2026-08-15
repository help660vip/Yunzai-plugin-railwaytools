import { createTimetableRealtimeProvider, RealtimeProviderRegistry } from './realtime-provider.js'
import { queryTrainDetails, RailwayServiceError } from './services.js'
import { normalizeIdentifier } from './utils.js'

const realtimeProviders = new RealtimeProviderRegistry([
  createTimetableRealtimeProvider(queryTrainDetails)
])

export async function queryRealtimeStatus(input) {
  const trainCode = normalizeIdentifier(input)
  if (!trainCode) throw new RailwayServiceError('请输入列车车次（如 G123）', 'INVALID_INPUT')
  return realtimeProviders.query(trainCode)
}
