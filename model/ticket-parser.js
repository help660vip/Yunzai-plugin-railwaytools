import { getShanghaiDate, normalizeUserText } from './utils.js'

const STATION_RE = /^\p{Script=Han}+$/u
const DATE_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})$/u
const CHINESE_DATE_RE = /^(\d{4})年(\d{1,2})月(\d{1,2})日$/u
const RANGE_RE = /^(\d{1,2})-(\d{1,2})$/u
const INTERVAL_RE = /^(\d+)\s*(分钟|小时)$/u
const EXACT_SUFFIX_RE = /(?:^|\s)-(精确站名|精确发站|精确到站)$/u

const EXACT_MODES = Object.freeze({
  精确站名: 'both',
  精确发站: 'from',
  精确到站: 'to'
})

function invalid(message) {
  const error = new Error(message)
  error.name = 'TicketInputError'
  error.code = 'INVALID_INPUT'
  return error
}

function normalizeDateParts(year, month, day) {
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12))
  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() + 1 !== Number(month) ||
    date.getUTCDate() !== Number(day)
  ) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function parseTicketDate(value, today = getShanghaiDate()) {
  const token = normalizeUserText(value).toLocaleLowerCase('en-US')
  if (!token || token === '今天' || token === 'today') return today
  if (token === '明天' || token === 'tomorrow') {
    const [year, month, day] = today.split('-').map(Number)
    const tomorrow = new Date(Date.UTC(year, month - 1, day + 1, 12))
    return [
      tomorrow.getUTCFullYear(),
      String(tomorrow.getUTCMonth() + 1).padStart(2, '0'),
      String(tomorrow.getUTCDate()).padStart(2, '0')
    ].join('-')
  }

  const match = token.match(DATE_RE) ?? token.match(CHINESE_DATE_RE)
  if (!match) return null
  const parsed = normalizeDateParts(match[1], match[2], match[3])
  if (!parsed) throw invalid('日期格式不正确，请检查年月日')
  return parsed < today ? today : parsed
}

export function extractExactMode(value) {
  let text = normalizeUserText(value)
  const match = text.match(EXACT_SUFFIX_RE)
  if (!match) return { text, exactMode: 'none' }
  text = text.slice(0, match.index).trim()
  return { text, exactMode: EXACT_MODES[match[1]] }
}

function requireStations(tokens) {
  if (tokens.length !== 2 || !tokens.every((token) => STATION_RE.test(token))) {
    throw invalid('请输入出发站和到达站，例如：#查询车票 北京南 上海虹桥 明天')
  }
  return tokens
}

export function parseTicketQueryInput(value, options = {}) {
  const { text, exactMode } = extractExactMode(value)
  const tokens = text ? text.split(/\s+/u) : []
  if (tokens.length < 2 || tokens.length > 3) {
    throw invalid('格式错误，请输入：#查询车票 出发站 到达站 日期（可选）')
  }

  const stationTokens = []
  let date = options.today ?? getShanghaiDate()
  let dateFound = false
  for (const token of tokens) {
    const parsedDate = parseTicketDate(token, options.today)
    if (parsedDate) {
      if (dateFound) throw invalid('只能填写一个乘车日期')
      date = parsedDate
      dateFound = true
    } else {
      stationTokens.push(token)
    }
  }
  const [fromStation, toStation] = requireStations(stationTokens)

  return { fromStation, toStation, date, exactMode }
}

export function parseScheduledTicketInput(value, options = {}) {
  const { text, exactMode } = extractExactMode(value)
  const tokens = text ? text.split(/\s+/u) : []
  if (tokens.length < 3 || tokens.length > 5) {
    throw invalid('格式错误，请输入：#定时查询车票 出发站 到达站 日期（可选） 时段（可选） 间隔')
  }

  const stationTokens = []
  let date = options.today ?? getShanghaiDate()
  let dateFound = false
  let timeRange = null
  let intervalMinutes = null
  let intervalLabel = ''

  for (const token of tokens) {
    const intervalMatch = token.match(INTERVAL_RE)
    if (intervalMatch) {
      const amount = Number(intervalMatch[1])
      if (!Number.isSafeInteger(amount) || amount <= 0) throw invalid('查询间隔必须大于 0')
      intervalMinutes = intervalMatch[2] === '小时' ? amount * 60 : amount
      intervalLabel = `${amount}${intervalMatch[2]}`
      continue
    }

    const rangeMatch = token.match(RANGE_RE)
    if (rangeMatch) {
      const startHour = Number(rangeMatch[1])
      const endHour = Number(rangeMatch[2])
      if (startHour < 0 || startHour > 23 || endHour < 1 || endHour > 24 || endHour <= startHour) {
        throw invalid('出发时段格式错误，结束小时必须大于开始小时，例如：14-16')
      }
      timeRange = { startHour, endHour }
      continue
    }

    const parsedDate = parseTicketDate(token, options.today)
    if (parsedDate) {
      if (dateFound) throw invalid('只能填写一个乘车日期')
      date = parsedDate
      dateFound = true
      continue
    }
    if (STATION_RE.test(token)) {
      stationTokens.push(token)
      continue
    }

    throw invalid(`无法识别参数“${token}”，可发送 #车票帮助 查看格式`)
  }

  const [fromStation, toStation] = requireStations(stationTokens)
  if (intervalMinutes == null) throw invalid('请提供定时查询间隔，例如：10分钟 或 1小时')
  return { fromStation, toStation, date, exactMode, timeRange, intervalMinutes, intervalLabel }
}

export function getTicketSessionKey(event = {}) {
  const selfId = String(event.self_id ?? event.selfId ?? 'bot')
  const userId = String(event.user_id ?? event.userId ?? event.get_user_id?.() ?? 'unknown')
  const groupId = event.group_id ?? event.groupId
  return groupId == null ? `${selfId}:private:${userId}` : `${selfId}:group:${groupId}:user:${userId}`
}
