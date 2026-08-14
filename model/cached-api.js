import {
  fetchCnrailRoute as fetchCnrailRouteUpstream,
  fetchCnrailStation as fetchCnrailStationUpstream,
  fetchRailReEmu as fetchRailReEmuUpstream,
  fetchRailReTrain as fetchRailReTrainUpstream,
  fetchStationScreen as fetchStationScreenUpstream,
  fetchTrainDetail as fetchTrainDetailUpstream,
  getLocomotiveAllocationIndex as getLocomotiveAllocationIndexUpstream,
  RailwayApiError,
  searchCnrail as searchCnrailUpstream
} from './api.js'
import { cacheRailwayData } from './cache.js'
import { normalizeIdentifier, normalizeUserText } from './utils.js'

const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value)

export { RailwayApiError }

export function fetchRailReTrain(trainCode) {
  return cacheRailwayData(
    'trainAssignment',
    `train:${normalizeIdentifier(trainCode)}`,
    () => fetchRailReTrainUpstream(trainCode),
    { validate: Array.isArray }
  )
}

export function fetchRailReEmu(emuNumber) {
  return cacheRailwayData(
    'trainAssignment',
    `emu:${normalizeIdentifier(emuNumber)}`,
    () => fetchRailReEmuUpstream(emuNumber),
    { validate: Array.isArray }
  )
}

export function fetchTrainDetail(trainCode, apiDate) {
  return cacheRailwayData(
    'trainDetail',
    `${normalizeIdentifier(trainCode)}:${apiDate}`,
    () => fetchTrainDetailUpstream(trainCode, apiDate),
    { validate: isObject }
  )
}

export function fetchStationScreen(stationName) {
  return cacheRailwayData(
    'stationScreen',
    normalizeUserText(stationName).toLocaleLowerCase('zh-CN'),
    () => fetchStationScreenUpstream(stationName),
    { validate: isObject }
  )
}

export function searchCnrail(keyword) {
  return cacheRailwayData(
    'cnrailSearch',
    normalizeUserText(keyword).toLocaleLowerCase('zh-CN'),
    () => searchCnrailUpstream(keyword),
    { validate: Array.isArray }
  )
}

export function fetchCnrailRoute(routeId) {
  return cacheRailwayData(
    'route',
    routeId,
    () => fetchCnrailRouteUpstream(routeId),
    { validate: isObject }
  )
}

export function fetchCnrailStation(stationId) {
  return cacheRailwayData(
    'station',
    stationId,
    () => fetchCnrailStationUpstream(stationId),
    { validate: isObject }
  )
}

export function getLocomotiveAllocationIndex() {
  return cacheRailwayData(
    'locomotiveAllocation',
    'index',
    getLocomotiveAllocationIndexUpstream,
    { validate: (value) => value instanceof Map && value.size > 0 }
  )
}
