import { cacheRailwayData } from './cache.js'
import {
  createTicketSession,
  fetchTicketAvailabilityRaw,
  fetchTicketPriceRaw,
  fetchTicketStations
} from './ticket-api.js'

const isRecord = (value) => value && typeof value === 'object' && !Array.isArray(value)

export function getTicketStationSource() {
  return cacheRailwayData('ticketStations', 'station-name', fetchTicketStations, {
    validate: (value) => typeof value === 'string' && value.includes('|')
  })
}

export function getTicketAvailability(request) {
  const key = `${request.date}:${request.fromCode}:${request.toCode}`
  return cacheRailwayData(
    'ticketAvailability',
    key,
    async () => fetchTicketAvailabilityRaw(request),
    { validate: Array.isArray }
  )
}

export function getTicketPrice(record, date, session) {
  const fields = String(record).split('|')
  const key = `${date}:${fields[2]}:${fields[16]}:${fields[17]}:${fields[34]}`
  return cacheRailwayData(
    'ticketPrice',
    key,
    async () => fetchTicketPriceRaw(record, date, session),
    { validate: isRecord }
  )
}

export { createTicketSession }
