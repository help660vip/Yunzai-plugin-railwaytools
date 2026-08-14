import { API_ENDPOINTS, HTTP_TIMEOUT_MS } from './constants.js'
import { decryptCnrailData, normalizeIdentifier } from './utils.js'

const DEFAULT_HEADERS = Object.freeze({
  Accept: 'application/json, text/plain, */*',
  'User-Agent': 'Yunzai-plugin-railwaytools (+https://github.com/help660vip/Yunzai-plugin-railwaytools)'
})

export class RailwayApiError extends Error {
  constructor(message, { code = 'UPSTREAM_ERROR', status, cause } = {}) {
    super(message, { cause })
    this.name = 'RailwayApiError'
    this.code = code
    this.status = status
  }
}

async function fetchText(url, options = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeout ?? HTTP_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      ...options,
      headers: { ...DEFAULT_HEADERS, ...options.headers },
      signal: controller.signal
    })
    if (!response.ok) {
      throw new RailwayApiError(`上游接口返回 HTTP ${response.status}`, {
        code: response.status === 404 ? 'NOT_FOUND' : 'HTTP_ERROR',
        status: response.status
      })
    }
    return await response.text()
  } catch (error) {
    if (error instanceof RailwayApiError) throw error
    if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
      throw new RailwayApiError('请求超时', { code: 'TIMEOUT', cause: error })
    }
    throw new RailwayApiError('无法连接上游接口', { code: 'NETWORK_ERROR', cause: error })
  } finally {
    clearTimeout(timer)
  }
}

async function fetchJson(url, options = {}) {
  const text = await fetchText(url, options)
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new RailwayApiError('上游接口返回了无法解析的数据', {
      code: 'INVALID_RESPONSE',
      cause: error
    })
  }
}

function endpoint(base, path) {
  return `${base}/${path.replace(/^\/+|\/+$/gu, '')}`
}

export async function fetchRailReTrain(trainCode) {
  return fetchJson(endpoint(API_ENDPOINTS.railRe, `train/${encodeURIComponent(trainCode)}`))
}

export async function fetchRailReEmu(emuNumber) {
  return fetchJson(endpoint(API_ENDPOINTS.railRe, `emu/${encodeURIComponent(emuNumber)}`))
}

export async function fetchTrainDetail(trainCode, apiDate) {
  const body = new URLSearchParams({ trainCode, startDay: apiDate })
  return fetchJson(API_ENDPOINTS.trainDetail, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body
  })
}

export async function fetchStationScreen(stationName) {
  return fetchJson(endpoint(API_ENDPOINTS.stationScreen, encodeURIComponent(stationName)))
}

export async function searchCnrail(keyword) {
  const url = `${endpoint(API_ENDPOINTS.cnrail, 'search')}?keyword=${encodeURIComponent(keyword)}`
  return fetchJson(url)
}

export async function fetchCnrailRoute(routeId) {
  const url = `${endpoint(API_ENDPOINTS.cnrail, `feature/${encodeURIComponent(routeId)}`)}?locale=zhcn`
  return fetchJson(url)
}

export async function fetchCnrailStation(stationId) {
  const url = `${endpoint(API_ENDPOINTS.cnrail, `poi/${encodeURIComponent(stationId)}`)}?locale=zhcn`
  const raw = await fetchText(url)
  const data = decryptCnrailData(raw)
  if (!data) {
    throw new RailwayApiError('车站接口返回了无法解析的数据', { code: 'INVALID_RESPONSE' })
  }
  return data
}

async function refreshAllocationIndex() {
  const raw = await fetchJson(API_ENDPOINTS.locomotiveAllocation, { timeout: 30_000 })
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new RailwayApiError('机车名录数据结构无效', { code: 'INVALID_RESPONSE' })
  }

  const index = new Map()
  for (const trains of Object.values(raw)) {
    if (!Array.isArray(trains)) continue
    for (const train of trains) {
      if (!train || typeof train !== 'object' || !train.id) continue
      const id = normalizeIdentifier(train.id)
      const matches = index.get(id) ?? []
      matches.push(train)
      index.set(id, matches)
    }
  }

  if (index.size === 0) {
    throw new RailwayApiError('机车名录没有可用数据', { code: 'INVALID_RESPONSE' })
  }

  return index
}

export async function getLocomotiveAllocationIndex() {
  return refreshAllocationIndex()
}
