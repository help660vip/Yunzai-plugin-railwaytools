import assert from 'node:assert/strict'
import test from 'node:test'

import { formatRealtimeStatus } from '../model/assistant-formatters.js'
import { createTimetableRealtimeProvider, RealtimeProviderRegistry } from '../model/realtime-provider.js'
import { getPublicErrorMessage } from '../model/services.js'

test('timetable realtime provider maps train details into a replaceable provider result', async () => {
  const provider = createTimetableRealtimeProvider(async (input) => {
    assert.equal(input, 'G123 -实时')
    return {
      trainCode: 'G123',
      rawTrainCode: 'G123',
      startStation: '北京南',
      endStation: '上海虹桥',
      serviceDate: '2026-08-15',
      runsToday: true,
      realtime: { text: '列车正在前往上海虹桥站', currentIndex: 0 },
      stops: [
        { station: '北京南', delay: 0 },
        { station: '上海虹桥', delay: 0 }
      ]
    }
  })
  const result = await new RealtimeProviderRegistry([provider]).query('G123')
  assert.equal(result.providerId, 'timetable-estimate')
  assert.equal(result.currentStation, '北京南')
  assert.equal(result.nextStation, '上海虹桥')
  assert.match(formatRealtimeStatus(result), /当前状态：列车正在前往上海虹桥站/u)
})

test('provider errors keep a stable public message', () => {
  assert.equal(
    getPublicErrorMessage({ code: 'PROVIDER_UNAVAILABLE' }),
    '列车实时状态数据源暂时不可用，请稍后再试'
  )
})
