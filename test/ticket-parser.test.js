import assert from 'node:assert/strict'
import test from 'node:test'

import {
  extractExactMode,
  getTicketSessionKey,
  parseScheduledTicketInput,
  parseTicketDate,
  parseTicketQueryInput
} from '../model/ticket-parser.js'

const TODAY = '2026-08-15'

test('parses optional ticket dates and normalizes past dates to today', () => {
  assert.equal(parseTicketDate('', TODAY), TODAY)
  assert.equal(parseTicketDate('today', TODAY), TODAY)
  assert.equal(parseTicketDate('明天', TODAY), '2026-08-16')
  assert.equal(parseTicketDate('tomorrow', TODAY), '2026-08-16')
  assert.equal(parseTicketDate('2026-8-20', TODAY), '2026-08-20')
  assert.equal(parseTicketDate('2026年8月20日', TODAY), '2026-08-20')
  assert.equal(parseTicketDate('2025-01-01', TODAY), TODAY)
})

test('parses ticket query whitespace and every exact-station subcommand', () => {
  const base = parseTicketQueryInput('  北京南\t上海虹桥  明天  ', { today: TODAY })
  assert.deepEqual(base, {
    fromStation: '北京南',
    toStation: '上海虹桥',
    date: '2026-08-16',
    exactMode: 'none'
  })
  assert.equal(extractExactMode('北京 上海 -精确站名').exactMode, 'both')
  assert.equal(extractExactMode('北京 上海 -精确发站').exactMode, 'from')
  assert.equal(extractExactMode('北京 上海 -精确到站').exactMode, 'to')
})

test('parses scheduled date, departure range, interval and fullwidth input', () => {
  const result = parseScheduledTicketInput(
    '湖州　厦门北　２０２６年８月１６日　１４－１６　１小时　－精确发站',
    { today: TODAY }
  )
  assert.deepEqual(result, {
    fromStation: '湖州',
    toStation: '厦门北',
    date: '2026-08-16',
    exactMode: 'from',
    timeRange: { startHour: 14, endHour: 16 },
    intervalMinutes: 60,
    intervalLabel: '1小时'
  })
})

test('rejects malformed dates, ranges and missing intervals', () => {
  assert.throws(() => parseTicketQueryInput('北京 上海 2026-02-31', { today: TODAY }), /日期格式不正确/u)
  assert.throws(() => parseScheduledTicketInput('北京 上海 16-14 10分钟', { today: TODAY }), /结束小时/u)
  assert.throws(() => parseScheduledTicketInput('北京 上海 明天', { today: TODAY }), /查询间隔/u)
})

test('uses bot, conversation and user identity as the session key', () => {
  assert.equal(getTicketSessionKey({ self_id: 1, group_id: 2, user_id: 3 }), '1:group:2:user:3')
  assert.equal(getTicketSessionKey({ self_id: 1, user_id: 3 }), '1:private:3')
})
