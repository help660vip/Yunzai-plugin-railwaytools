import {
  createTicketSession,
  getTicketAvailability,
  getTicketPrice,
  getTicketStationSource
} from './ticket-cached-api.js'
import { RailwayServiceError } from './services.js'

const PAGE_SIZE = 10
const AVAILABLE_SEAT_INDEXES = Object.freeze([30, 31, 32, 33, 29, 23, 28, 21, 26])
const SEAT_DEFINITIONS = Object.freeze([
  ['O', '二等座', 30],
  ['M', '一等座', 31],
  ['A9', '商务座', 32],
  ['F', '动卧', 33],
  ['AI', '一等卧', 23],
  ['AJ', '二等卧', 28],
  ['A1', '硬座', 29],
  ['A2', '软座', 23],
  ['A3', '硬卧', 28],
  ['A4', '软卧', 23],
  ['A5', '高级软卧', 21],
  ['WZ', '无座', 26]
])

function parseStationIndex(source) {
  const byName = new Map()
  const byCode = new Map()
  for (const match of String(source).matchAll(/@[^|]*\|([^|]+)\|([^|]+)\|[^|]*/gu)) {
    const name = match[1]?.trim()
    const code = match[2]?.trim().toUpperCase()
    if (!name || !code) continue
    byName.set(name, code)
    byCode.set(code, name)
  }
  if (byName.size === 0) {
    throw new RailwayServiceError('12306 车站数据暂时不可用', 'INVALID_RESPONSE')
  }
  return { byName, byCode }
}

function requireRecord(record) {
  const fields = String(record).split('|')
  if (fields.length < 35 || !fields[3]) return null
  return fields
}

function matchesExactMode(fields, request) {
  if (request.exactMode === 'both') return fields[6] === request.fromCode && fields[7] === request.toCode
  if (request.exactMode === 'from') return fields[6] === request.fromCode
  if (request.exactMode === 'to') return fields[7] === request.toCode
  return true
}

function matchesTimeRange(fields, timeRange) {
  if (!timeRange) return true
  const [hours, minutes] = String(fields[8]).split(':').map(Number)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return false
  const value = hours * 60 + minutes
  return value > timeRange.startHour * 60 && value < timeRange.endHour * 60
}

function hasAvailableSeat(record) {
  const fields = requireRecord(record)
  if (!fields) return false
  return AVAILABLE_SEAT_INDEXES.some((index) => {
    const value = fields[index]
    return value != null && value !== '' && value !== '无' && value !== '*'
  })
}

function formatDuration(value) {
  const [hours, minutes] = String(value).split(':').map(Number)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return String(value || '未知')
  if (hours === 0) return `${minutes}分`
  if (minutes === 0) return `${hours}小时整`
  return `${hours}小时${minutes}分`
}

function formatPrice(value) {
  return String(value ?? '').replace(/\.0(?=\D|$)/gu, '')
}

function formatSeatValue(remaining, price) {
  const count = remaining || '无'
  const label = count === '*' ? '暂未开售' : count === '有' || count === '无' ? count : `${count}张`
  const normalizedPrice = formatPrice(price)
  return normalizedPrice ? `${normalizedPrice}  ${label}` : label
}

function buildSeatRows(fields, priceData) {
  const rows = []
  for (const [code, name, remainingIndex] of SEAT_DEFINITIONS) {
    if (!Object.hasOwn(priceData, code) || Array.isArray(priceData[code])) continue
    rows.push({ name, value: formatSeatValue(fields[remainingIndex], priceData[code]) })
  }
  if (rows.length > 0) return rows

  for (const [, name, remainingIndex] of SEAT_DEFINITIONS) {
    const remaining = fields[remainingIndex]
    if (!remaining || remaining === '无') continue
    if (!rows.some((row) => row.name === name)) rows.push({ name, value: formatSeatValue(remaining, '') })
  }
  return rows
}

async function loadTrain(record, request, stationIndex, session) {
  const fields = requireRecord(record)
  if (!fields) return null
  let priceData = {}
  try {
    priceData = await getTicketPrice(record, request.date, session)
  } catch {
    // Availability remains useful if the separate 12306 price endpoint is temporarily unavailable.
  }
  return {
    trainCode: fields[3],
    originStation: stationIndex.byCode.get(fields[4]) ?? fields[4],
    terminalStation: stationIndex.byCode.get(fields[5]) ?? fields[5],
    fromStation: stationIndex.byCode.get(fields[6]) ?? request.fromStation,
    toStation: stationIndex.byCode.get(fields[7]) ?? request.toStation,
    departureTime: fields[8] || '--:--',
    arrivalTime: fields[9] || '--:--',
    duration: formatDuration(fields[10]),
    seats: buildSeatRows(fields, priceData)
  }
}

export async function queryTickets(request) {
  const stationIndex = parseStationIndex(await getTicketStationSource())
  const fromCode = stationIndex.byName.get(request.fromStation)
  const toCode = stationIndex.byName.get(request.toStation)
  if (!fromCode || !toCode) {
    throw new RailwayServiceError('未查询到发站或到站，请检查车站全名', 'NOT_FOUND')
  }

  const resolvedRequest = { ...request, fromCode, toCode }
  const raw = await getTicketAvailability(resolvedRequest)
  const records = raw.filter((record) => {
    const fields = requireRecord(record)
    return fields && matchesExactMode(fields, resolvedRequest) && matchesTimeRange(fields, request.timeRange)
  })
  return { request: resolvedRequest, stationIndex, records }
}

export async function buildTicketPage(result, page = 1, options = {}) {
  const totalPages = Math.max(1, Math.ceil(result.records.length / PAGE_SIZE))
  const pageNumber = Math.min(Math.max(1, Number(page) || 1), totalPages)
  const offset = (pageNumber - 1) * PAGE_SIZE
  const records = result.records.slice(offset, offset + PAGE_SIZE)
  const session = records.length > 0 ? await createTicketSession() : null
  const trains = []
  for (const record of records) {
    const train = await loadTrain(record, result.request, result.stationIndex, session)
    if (train) trains.push(train)
  }
  return {
    request: result.request,
    trains,
    page: pageNumber,
    totalPages,
    totalResults: result.records.length,
    hasNextPage: pageNumber < totalPages,
    scheduled: options.scheduled === true
  }
}

export function getAvailableTicketResult(result) {
  return { ...result, records: result.records.filter(hasAvailableSeat) }
}

export const TICKET_PAGE_SIZE = PAGE_SIZE
