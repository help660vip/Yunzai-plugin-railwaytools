import { loadEncyclopediaEntries, searchEncyclopedia } from './encyclopedia.js'
import {
  createRailwayNetworkEncyclopediaProvider,
  EncyclopediaProviderRegistry
} from './encyclopedia-provider.js'
import { loadRandomTrainCandidates } from './random-train-data.js'
import { selectRandomTrain } from './random-train.js'
import { createTimetableRealtimeProvider, RealtimeProviderRegistry } from './realtime-provider.js'
import { queryRoute, queryStation, queryTrainDetails, RailwayServiceError } from './services.js'
import { normalizeIdentifier, normalizeUserText } from './utils.js'

const realtimeProviders = new RealtimeProviderRegistry([
  createTimetableRealtimeProvider(queryTrainDetails)
])

const encyclopediaProviders = new EncyclopediaProviderRegistry([
  createRailwayNetworkEncyclopediaProvider({ queryRoute, queryStation })
])

export async function queryRealtimeStatus(input) {
  const trainCode = normalizeIdentifier(input)
  if (!trainCode) throw new RailwayServiceError('请输入列车车次（如 G123）', 'INVALID_INPUT')
  return realtimeProviders.query(trainCode)
}

export async function queryEncyclopedia(input) {
  const keyword = normalizeUserText(input)
  if (!keyword) throw new RailwayServiceError('请输入铁路百科关键词（如 CR400AF）', 'INVALID_INPUT')
  const localResult = await searchEncyclopedia(keyword)
  if (localResult.entries.length > 0) return localResult

  return {
    ...localResult,
    entries: await encyclopediaProviders.query(localResult)
  }
}

export async function queryRandomTrain(options = {}) {
  const [trainCodes, encyclopediaEntries] = await Promise.all([
    loadRandomTrainCandidates(),
    loadEncyclopediaEntries()
  ])
  const knowledgeEntries = encyclopediaEntries.filter((entry) => entry.type === 'train')
  return selectRandomTrain({
    trainCodes,
    knowledgeEntries,
    loadTrainDetails: queryTrainDetails,
    random: options.random ?? Math.random,
    maxAttempts: options.maxAttempts ?? trainCodes.length
  })
}
