import assert from 'node:assert/strict'
import test from 'node:test'

import { clearRailwayCache } from '../model/cache.js'
import { buildTicketPage, getAvailableTicketResult, queryTickets } from '../model/ticket-service.js'

function ticketRecord({ trainCode = 'G123', remaining = '5', departure = '08:00' } = {}) {
  const fields = Array(40).fill('')
  fields[2] = '240000G1230A'
  fields[3] = trainCode
  fields[4] = 'VNP'
  fields[5] = 'AOH'
  fields[6] = 'VNP'
  fields[7] = 'AOH'
  fields[8] = departure
  fields[9] = '12:30'
  fields[10] = '04:30'
  fields[16] = '01'
  fields[17] = '05'
  fields[30] = remaining
  fields[31] = '无'
  fields[34] = 'OM'
  return fields.join('|')
}

function installTicketFetch(context, records) {
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (input) => {
    const url = String(input)
    calls.push(url)
    if (url.includes('station_name.js')) {
      return new Response('@bjn|北京南|VNP|beijingnan|bjn|0@shh|上海虹桥|AOH|shanghaihongqiao|shhq|0')
    }
    if (url.endsWith('/leftTicket/init')) {
      return new Response("var CLeftTicketUrl = {'queryUrl':'leftTicket/queryG'}", {
        headers: { 'set-cookie': 'JSESSIONID=test; Path=/; HttpOnly' }
      })
    }
    if (url.includes('leftTicket/queryG')) {
      return Response.json({ data: { result: records } })
    }
    if (url.includes('queryTicketPrice')) {
      return Response.json({ data: { O: '¥553.0', M: '¥933.0' } })
    }
    throw new Error(`Unexpected URL: ${url}`)
  }
  context.after(() => { globalThis.fetch = originalFetch })
  return calls
}

test('queries 12306, resolves stations, applies exact filters and formats prices', async (context) => {
  await clearRailwayCache()
  const calls = installTicketFetch(context, [ticketRecord()])
  const result = await queryTickets({
    fromStation: '北京南',
    toStation: '上海虹桥',
    date: '2026-08-16',
    exactMode: 'both',
    timeRange: null
  })
  assert.equal(result.records.length, 1)
  const page = await buildTicketPage(result, 1)
  assert.equal(page.trains[0].trainCode, 'G123')
  assert.deepEqual(page.trains[0].seats, [
    { name: '二等座', value: '¥553  5张' },
    { name: '一等座', value: '¥933  无' }
  ])
  assert.ok(calls.some((url) => url.includes('leftTicket/queryG')))
})

test('filters scheduled results by departure range and available seats', async (context) => {
  await clearRailwayCache()
  installTicketFetch(context, [
    ticketRecord({ trainCode: 'G1', remaining: '无', departure: '13:30' }),
    ticketRecord({ trainCode: 'G2', remaining: '有', departure: '15:00' }),
    ticketRecord({ trainCode: 'G3', remaining: '2', departure: '17:00' })
  ])
  const result = await queryTickets({
    fromStation: '北京南',
    toStation: '上海虹桥',
    date: '2026-08-16',
    exactMode: 'none',
    timeRange: { startHour: 14, endHour: 16 }
  })
  assert.equal(result.records.length, 1)
  assert.equal(getAvailableTicketResult(result).records.length, 1)
})
