import {
  fetchCnrailRoute,
  fetchCnrailStation,
  fetchRailReEmu,
  fetchRailReTrain,
  fetchStationScreen,
  fetchTrainDetail,
  RailwayApiError,
  searchCnrail
} from './cached-api.js'
import { MAX_ASSIGNMENT_ITEMS, MAX_LIST_ITEMS } from './constants.js'
import {
  asNonEmptyString,
  formatCompactTime,
  formatDateTime,
  formatEmuNumber,
  getShanghaiDate,
  getShanghaiMinutes,
  normalizeIdentifier,
  normalizeUserText,
  parseRealtimeInput,
  timeToMinutes,
  toApiDate
} from './utils.js'

export class RailwayServiceError extends Error {
  constructor(message, code = 'SERVICE_ERROR', options = {}) {
    super(message, options)
    this.name = 'RailwayServiceError'
    this.code = code
  }
}

function requireIdentifier(value, label) {
  const identifier = normalizeIdentifier(value)
  if (!identifier) throw new RailwayServiceError(`请输入${label}`, 'INVALID_INPUT')
  return identifier
}

function requireText(value, label) {
  const text = normalizeUserText(value)
  if (!text) throw new RailwayServiceError(`请输入${label}`, 'INVALID_INPUT')
  return text
}

function requireArray(value, source) {
  if (!Array.isArray(value)) {
    throw new RailwayServiceError(`${source}返回的数据结构异常`, 'INVALID_RESPONSE')
  }
  return value
}

function getTrainDetailObject(response) {
  const detail = response?.data?.trainDetail
  return detail && typeof detail === 'object' && !Array.isArray(detail) && Array.isArray(detail.stopTime)
    ? detail
    : null
}

export async function queryEmuAssignments(trainCodeInput) {
  const trainCode = requireIdentifier(trainCodeInput, '动车组车次（如 G123）')
  const data = requireArray(await fetchRailReTrain(trainCode), 'rail.re')
  const records = data
    .filter((item) => item && typeof item === 'object' && item.emu_no)
    .slice(0, MAX_ASSIGNMENT_ITEMS)
    .map((item) => ({
      date: asNonEmptyString(item.date, '日期未知'),
      emuNumber: formatEmuNumber(item.emu_no)
    }))

  return {
    trainCode: normalizeIdentifier(data[0]?.train_no || trainCode),
    records
  }
}

export async function queryTrainAssignments(emuNumberInput) {
  const emuNumber = requireIdentifier(emuNumberInput, '动车组号（如 CRH2A-2001）')
  const data = requireArray(await fetchRailReEmu(emuNumber), 'rail.re')
  const records = data
    .filter((item) => item && typeof item === 'object' && item.train_no)
    .slice(0, MAX_ASSIGNMENT_ITEMS)
    .map((item) => ({
      date: asNonEmptyString(item.date, '日期未知'),
      trainCode: normalizeIdentifier(item.train_no)
    }))

  return {
    emuNumber: formatEmuNumber(data[0]?.emu_no || emuNumber),
    records
  }
}

async function resolveTrainStyle(trainCode, serviceDate, fallback) {
  if (!/^[DGC]/u.test(trainCode)) return asNonEmptyString(fallback)

  try {
    const records = await fetchRailReTrain(trainCode)
    if (!Array.isArray(records)) return asNonEmptyString(fallback)

    const emuNumbers = records
      .filter((item) => String(item?.date ?? '').startsWith(serviceDate) && item?.emu_no)
      .map((item) => formatEmuNumber(item.emu_no))
      .filter((item, index, array) => item && array.indexOf(item) === index)

    if (emuNumbers.length >= 2) return `${emuNumbers[0]}与${emuNumbers[1]}重联`
    if (emuNumbers.length === 1) return emuNumbers[0]
  } catch {
    // A missing rail.re record must not prevent the 12306 timetable result.
  }

  return asNonEmptyString(fallback)
}

function buildRealtimeStatus(stops) {
  const now = getShanghaiMinutes()
  const firstDeparture = timeToMinutes(stops[0]?.startTime, stops[0]?.dayDifference)
  const lastIndex = stops.length - 1
  const lastArrival = timeToMinutes(stops[lastIndex]?.arriveTime, stops[lastIndex]?.dayDifference)

  if (Number.isFinite(firstDeparture) && now < firstDeparture) {
    return { text: '列车始发站待发', currentIndex: 0 }
  }

  for (let index = 0; index < stops.length; index += 1) {
    const stop = stops[index]
    const arrival = timeToMinutes(stop.arriveTime, stop.dayDifference)
    const departure = timeToMinutes(stop.startTime, stop.dayDifference)

    if (Number.isFinite(arrival) && Number.isFinite(departure) && now >= arrival && now <= departure) {
      return { text: `列车已经到达${stop.station}站`, currentIndex: index }
    }

    const next = stops[index + 1]
    if (!next) continue
    const nextArrival = timeToMinutes(next.arriveTime, next.dayDifference)
    if (Number.isFinite(departure) && Number.isFinite(nextArrival) && now > departure && now < nextArrival) {
      return { text: `列车正在前往${next.station}站`, currentIndex: index }
    }
  }

  if (Number.isFinite(lastArrival) && now >= lastArrival) {
    return { text: '列车已经到达终点站', currentIndex: lastIndex }
  }
  return { text: '暂时无法判断列车当前位置', currentIndex: -1 }
}

export async function queryTrainDetails(input) {
  const { identifier: trainCode, realtime: realtimeRequested } = parseRealtimeInput(input)
  if (!trainCode) {
    throw new RailwayServiceError('请输入列车车次（如 G123）', 'INVALID_INPUT')
  }

  const today = getShanghaiDate()
  const candidateDates = [today, getShanghaiDate(-1), getShanghaiDate(1), getShanghaiDate(-2), getShanghaiDate(2)]
  let detail = null
  let serviceDate = today

  for (const date of candidateDates) {
    const response = await fetchTrainDetail(trainCode, toApiDate(date))
    const candidate = getTrainDetailObject(response)
    if (candidate?.stopTime?.length) {
      detail = candidate
      serviceDate = date
      break
    }
  }

  if (!detail) {
    throw new RailwayServiceError(
      `无法查询到 ${trainCode}，请检查车次是否正确或该车近期是否开行`,
      'NOT_FOUND'
    )
  }

  const stopTime = detail.stopTime
  const lastIndex = stopTime.length - 1
  const stops = stopTime.map((stop, index) => ({
    station: asNonEmptyString(stop?.stationName, '未知车站'),
    arriveTime: index === 0 ? '--:--' : formatCompactTime(stop?.arriveTime),
    startTime: index === lastIndex ? '--:--' : formatCompactTime(stop?.startTime),
    stopover: index === 0 || index === lastIndex
      ? '--分'
      : `${asNonEmptyString(stop?.stopover_time, '--')}分`,
    delay: Number.parseInt(stop?.ticketDelay, 10),
    dayDifference: Number.parseInt(stop?.dayDifference, 10) || 0,
    trainCode: normalizeIdentifier(stop?.stationTrainCode || trainCode),
    rawArriveTime: stop?.arriveTime,
    rawStartTime: stop?.startTime
  }))

  const firstStop = stopTime[0]
  const rawTrainCode = normalizeIdentifier(firstStop?.stationTrainCode || trainCode)
  const runsToday = serviceDate === today
  const trainStyle = await resolveTrainStyle(rawTrainCode, serviceDate, firstStop?.jiaolu_train_style)
  const realtime = realtimeRequested && runsToday ? buildRealtimeStatus(stops) : null

  return {
    queryCode: trainCode,
    trainCode: asNonEmptyString(detail.stationTrainCodeAll, rawTrainCode),
    rawTrainCode,
    startStation: asNonEmptyString(firstStop?.start_station_name, stops[0].station),
    endStation: asNonEmptyString(firstStop?.end_station_name, stops[lastIndex].station),
    corporation: asNonEmptyString(firstStop?.jiaolu_corporation_code),
    trainStyle,
    allocation: asNonEmptyString(firstStop?.jiaolu_dept_train),
    serviceDate,
    runsToday,
    realtimeRequested,
    realtime,
    stops
  }
}

export async function queryStationScreen(stationNameInput) {
  const stationName = requireText(stationNameInput, '车站名称（如 上海）')
    .replace(/(?:火车站|车站|站)$/u, '')
    .trim()
  if (!stationName) throw new RailwayServiceError('请输入正确的车站名称', 'INVALID_INPUT')

  const response = await fetchStationScreen(stationName)
  if (response?.error) {
    throw new RailwayServiceError('该车站不存在或暂未收录', 'NOT_FOUND')
  }
  const data = requireArray(response?.data, '车站大屏接口')

  const trains = data
    .filter((item) => Array.isArray(item) && item.length >= 6)
    .slice(0, MAX_LIST_ITEMS)
    .map((item) => ({
      trainCode: asNonEmptyString(item[0]),
      startStation: asNonEmptyString(item[1]),
      endStation: asNonEmptyString(item[2]),
      departureTime: formatDateTime(item[3]),
      waitingRoom: asNonEmptyString(item[4]),
      status: asNonEmptyString(item[5])
    }))

  return { stationName, trains }
}

export async function queryRoute(routeNameInput) {
  const originalName = requireText(routeNameInput, '线路名称')
  const isHighSpeed = /(?:高速铁路|高速线|高铁)$/u.test(originalName)
  const routeName = originalName.replace(/(?:高速铁路|高速线|高铁|铁路|线)$/u, '').trim()
  if (!routeName) throw new RailwayServiceError('请输入正确的线路名称', 'INVALID_INPUT')

  const searchResults = requireArray(await searchCnrail(routeName), 'cnrail 搜索接口')
  const routeResults = searchResults.filter(
    (item) => item && typeof item === 'object' && String(item.query ?? '').startsWith('rail/')
  )
  const preferred = routeResults.find((item) => {
    const name = String(item.name ?? '')
    return isHighSpeed ? /高速|高铁/u.test(name) : !/高速|高铁/u.test(name)
  }) ?? routeResults[0]

  if (!preferred) throw new RailwayServiceError('该线路不存在或暂未收录', 'NOT_FOUND')

  const routeId = String(preferred.query).slice('rail/'.length)
  const response = await fetchCnrailRoute(routeId)
  const data = response?.data
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new RailwayServiceError('线路接口返回的数据结构异常', 'INVALID_RESPONSE')
  }

  const stations = Array.isArray(data.stations)
    ? data.stations.map((station) => ({
        name: asNonEmptyString(station?.name, '未知车站'),
        mileage: station?.mileage == null ? '' : `${station.mileage} km`
      }))
    : []

  const lineCount = String(data.lines ?? '')
  return {
    name: asNonEmptyString(data.name, asNonEmptyString(preferred.name, routeName)),
    railType: asNonEmptyString(data.railtype),
    lineType: lineCount === '2' ? '复线铁路' : lineCount === '1' ? '单线铁路' : asNonEmptyString(data.lines),
    designSpeed: asNonEmptyString(data.design_speed),
    stations
  }
}

function normalizeStationInput(value) {
  const original = requireText(value, '车站名称')
  const metroRequested = /地铁站$/u.test(original)
  const stationName = original.replace(/(?:地铁站|火车站|车站|站)$/u, '').trim()
  if (!stationName) throw new RailwayServiceError('请输入正确的车站名称', 'INVALID_INPUT')
  return { stationName, metroRequested }
}

function getDirection(rawDirection) {
  const direction = Array.isArray(rawDirection) ? rawDirection[0] : null
  if (!direction || typeof direction !== 'object') return { station: '暂无数据', destination: '' }
  if (direction.adj?.name) {
    return {
      station: asNonEmptyString(direction.adj.name),
      destination: direction.dest?.name ? `（${direction.dest.name}）方向` : ''
    }
  }
  if (direction.dest?.status === 'END') return { station: '起迄站', destination: '' }
  return { station: '暂无数据', destination: '' }
}

export async function queryStation(stationNameInput) {
  const { stationName, metroRequested } = normalizeStationInput(stationNameInput)
  const searchResults = requireArray(await searchCnrail(stationName), 'cnrail 搜索接口')
  const candidates = searchResults.filter((item) => {
    if (!item || typeof item !== 'object' || !String(item.query ?? '').startsWith('geo/')) return false
    return normalizeUserText(item.name) === stationName
  })

  let selected = null
  let lastApiError = null
  const expectedType = metroRequested ? '地铁站' : '火车站'
  for (const candidate of candidates) {
    const stationId = String(candidate.query).slice('geo/'.length)
    let data
    try {
      data = await fetchCnrailStation(stationId)
    } catch (error) {
      if (error instanceof RailwayApiError) {
        lastApiError = error
        continue
      }
      throw error
    }
    if (!data || typeof data !== 'object') continue
    if (data.featureType === expectedType) {
      selected = data
      break
    }
  }

  if (!selected && lastApiError) throw lastApiError
  if (!selected) {
    const stationType = metroRequested ? '地铁站' : '火车站'
    throw new RailwayServiceError(`该${stationType}不存在或暂未收录`, 'NOT_FOUND')
  }

  const detail = selected.exd?.[0]?.data
  if (!detail || typeof detail !== 'object') {
    throw new RailwayServiceError('车站接口返回的数据结构异常', 'INVALID_RESPONSE')
  }

  const isMetro = selected.featureType === '地铁站'
  const connections = Array.isArray(detail.connection)
    ? detail.connection.map((connection) => ({
        lineName: asNonEmptyString(connection?.linename, '未知线路'),
        next: getDirection(connection?.next),
        previous: getDirection(connection?.prev)
      }))
    : []

  return {
    name: `${asNonEmptyString(selected.name, stationName)}${isMetro ? '地铁站' : ''}`,
    type: asNonEmptyString(selected.featureType),
    telecode: asNonEmptyString(detail.tele_code, ''),
    operator: asNonEmptyString(detail.operators?.[0]?.name),
    location: asNonEmptyString(selected.location),
    passengerService: isMetro ? null : Boolean(detail.trainservice),
    connections
  }
}

export function getPublicErrorMessage(error) {
  if (error instanceof RailwayServiceError) return error.message
  if (error instanceof RailwayApiError) {
    if (error.code === 'TIMEOUT') return '请求超时，请稍后再试'
    if (error.code === 'NOT_FOUND') return '未查询到相关信息'
    return '铁路数据服务暂时不可用，请稍后再试'
  }
  if (error?.code === 'INVALID_CACHE_DATA') return '铁路数据服务返回异常，请稍后再试'
  if (error?.name === 'TicketInputError') return error.message
  if (error?.code === 'PROVIDER_UNAVAILABLE') return '列车实时状态数据源暂时不可用，请稍后再试'
  return '查询时发生异常，请稍后再试'
}
