const ZERO_WIDTH_RE = /[\u200B-\u200D\u2060\uFEFF]/gu
const SHANGHAI_TIME_ZONE = 'Asia/Shanghai'

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: SHANGHAI_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
})

const timeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: SHANGHAI_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
})

function partsToObject(parts) {
  return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
}

export function normalizeUserText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(ZERO_WIDTH_RE, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

export function normalizeIdentifier(value) {
  return normalizeUserText(value).replace(/\s+/gu, '').toUpperCase()
}

export function extractCommandArgument(rawMessage, aliases) {
  const message = normalizeUserText(rawMessage)
  if (!message.startsWith('#')) return null

  const body = message.slice(1).trimStart()
  const alias = [...aliases]
    .sort((left, right) => right.length - left.length)
    .find((candidate) => {
      if (body.slice(0, candidate.length).toLocaleLowerCase('en-US') !== candidate.toLocaleLowerCase('en-US')) {
        return false
      }
      const next = body.slice(candidate.length, candidate.length + 1)
      return !next || /\s/u.test(next)
    })

  return alias ? body.slice(alias.length).trim() : null
}

export function formatEmuNumber(value) {
  const normalized = normalizeIdentifier(value)
  if (!normalized || normalized.includes('-') || normalized.length <= 4) return normalized
  return `${normalized.slice(0, -4)}-${normalized.slice(-4)}`
}

export function formatCompactTime(value) {
  const raw = String(value ?? '').replace(/\D/gu, '')
  if (raw.length < 4) return '--:--'
  return `${raw.slice(0, 2)}:${raw.slice(2, 4)}`
}

export function formatDateTime(value) {
  const match = String(value ?? '').match(/(?:^|\s)(\d{1,2}:\d{2})(?::\d{2})?(?:$|\s)/u)
  return match?.[1] ?? '--:--'
}

export function getShanghaiDate(offsetDays = 0) {
  const parts = partsToObject(dateFormatter.formatToParts(new Date()))
  const shifted = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + offsetDays, 12))
  const year = shifted.getUTCFullYear()
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0')
  const day = String(shifted.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function toApiDate(date) {
  return String(date).replaceAll('-', '')
}

export function formatChineseDate(date) {
  const [, month = '', day = ''] = String(date).split('-')
  return `${month}月${day}日`
}

export function getShanghaiMinutes() {
  const parts = partsToObject(timeFormatter.formatToParts(new Date()))
  return Number(parts.hour) * 60 + Number(parts.minute)
}

export function timeToMinutes(value, dayDifference = 0) {
  const raw = String(value ?? '').replace(/\D/gu, '')
  if (raw.length < 4) return Number.NaN
  return Number(raw.slice(0, 2)) * 60 + Number(raw.slice(2, 4)) + Number(dayDifference || 0) * 1440
}

export function parseRealtimeInput(value) {
  const normalized = normalizeUserText(value)
  const realtime = /(?:-|－)\s*实时(?:\s*)$/u.test(normalized)
  const identifier = normalizeIdentifier(normalized.replace(/(?:-|－)\s*实时(?:\s*)$/u, ''))
  return { identifier, realtime }
}

export function looksLikeTrainCode(value) {
  const { identifier } = parseRealtimeInput(value)
  return /^(?:[A-Z]{0,2})?\d+(?:\/(?:[A-Z]{0,2})?\d+)?$/u.test(identifier)
}

export function decryptCnrailData(rawValue) {
  let encrypted = String(rawValue ?? '').trim()
  if (!encrypted) return null

  try {
    const parsed = JSON.parse(encrypted)
    if (parsed && typeof parsed === 'object') return parsed
    if (typeof parsed === 'string') encrypted = parsed
  } catch {
    // The endpoint normally returns an encrypted, non-JSON payload.
  }

  const keyLength = encrypted.charCodeAt(0)
  if (!Number.isInteger(keyLength) || keyLength <= 0 || encrypted.length <= keyLength) return null

  const key = encrypted.slice(1, 1 + keyLength)
  const payload = encrypted.slice(1 + keyLength)
  if (!key || !payload) return null

  let decrypted = ''
  for (let index = 0; index < payload.length; index += 1) {
    const code = payload.charCodeAt(index) - key.charCodeAt(index % key.length)
    if (code < 0) return null
    decrypted += String.fromCharCode(code)
  }

  try {
    const data = JSON.parse(decrypted)
    return data && typeof data === 'object' ? data : null
  } catch {
    return null
  }
}

export function asNonEmptyString(value, fallback = '暂无数据') {
  const text = String(value ?? '').trim()
  return text && text.toLowerCase() !== 'null' ? text : fallback
}
