import { API_ENDPOINTS, HTTP_TIMEOUT_MS } from './constants.js'
import { RailwayApiError } from './api.js'

const TICKET_HEADERS = Object.freeze({
  Accept: 'application/json, text/plain, */*',
  Referer: API_ENDPOINTS.ticketInit,
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/128 Safari/537.36'
})

async function request(url, options = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeout ?? HTTP_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      ...options,
      headers: { ...TICKET_HEADERS, ...options.headers },
      signal: controller.signal
    })
    if (!response.ok) {
      throw new RailwayApiError(`12306 返回 HTTP ${response.status}`, {
        code: response.status === 404 ? 'NOT_FOUND' : 'HTTP_ERROR',
        status: response.status
      })
    }
    return response
  } catch (error) {
    if (error instanceof RailwayApiError) throw error
    if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
      throw new RailwayApiError('12306 请求超时', { code: 'TIMEOUT', cause: error })
    }
    throw new RailwayApiError('无法连接 12306', { code: 'NETWORK_ERROR', cause: error })
  } finally {
    clearTimeout(timer)
  }
}

async function readJson(response) {
  try {
    return await response.json()
  } catch (error) {
    throw new RailwayApiError('12306 返回了无法解析的数据', {
      code: 'INVALID_RESPONSE',
      cause: error
    })
  }
}

function extractCookies(headers) {
  const values = typeof headers.getSetCookie === 'function'
    ? headers.getSetCookie()
    : [headers.get('set-cookie')].filter(Boolean)
  return values
    .flatMap((value) => String(value).split(/,(?=\s*[^;,=\s]+=[^;,]*)/u))
    .map((value) => value.split(';', 1)[0].trim())
    .filter(Boolean)
    .join('; ')
}

function resolveQueryUrl(html) {
  const configured = html.match(/['"]queryUrl['"]\s*:\s*['"]([^'"]+)['"]/u)?.[1]
  const fallback = html.match(/leftTicket\/query[A-Z]?/u)?.[0] ?? 'leftTicket/query'
  const relative = configured ?? fallback
  return new URL(relative, 'https://kyfw.12306.cn/otn/').href
}

export async function createTicketSession() {
  const response = await request(API_ENDPOINTS.ticketInit)
  const html = await response.text()
  return { queryUrl: resolveQueryUrl(html), cookie: extractCookies(response.headers) }
}

export async function fetchTicketStations() {
  const response = await request(API_ENDPOINTS.ticketStations, { timeout: 30_000 })
  return response.text()
}

export async function fetchTicketAvailabilityRaw(ticketRequest, session = null) {
  const context = session ?? await createTicketSession()
  const url = new URL(context.queryUrl)
  url.search = new URLSearchParams({
    'leftTicketDTO.train_date': ticketRequest.date,
    'leftTicketDTO.from_station': ticketRequest.fromCode,
    'leftTicketDTO.to_station': ticketRequest.toCode,
    purpose_codes: 'ADULT'
  })
  const response = await request(url, {
    headers: context.cookie ? { Cookie: context.cookie } : undefined
  })
  const payload = await readJson(response)
  const records = payload?.data?.result
  if (!Array.isArray(records)) {
    const message = payload?.messages?.[0] || payload?.message || '12306 余票数据结构异常'
    throw new RailwayApiError(String(message), { code: 'INVALID_RESPONSE' })
  }
  return records
}

export async function fetchTicketPriceRaw(record, date, session = null) {
  const fields = String(record).split('|')
  if (fields.length < 35) {
    throw new RailwayApiError('12306 车次记录结构异常', { code: 'INVALID_RESPONSE' })
  }
  const context = session ?? await createTicketSession()
  const url = new URL(API_ENDPOINTS.ticketPrice)
  url.search = new URLSearchParams({
    train_no: fields[2],
    from_station_no: fields[16],
    to_station_no: fields[17],
    seat_types: fields[34].replaceAll('0', ''),
    train_date: date
  })
  const response = await request(url, {
    headers: context.cookie ? { Cookie: context.cookie } : undefined
  })
  const payload = await readJson(response)
  if (!payload?.data || typeof payload.data !== 'object' || Array.isArray(payload.data)) {
    throw new RailwayApiError('12306 票价数据结构异常', { code: 'INVALID_RESPONSE' })
  }
  return payload.data
}
