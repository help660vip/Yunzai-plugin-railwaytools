import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ASSISTANT_HELP_TEXT,
  formatEncyclopedia,
  formatRandomTrain,
  formatRealtimeStatus
} from '../model/assistant-formatters.js'
import { loadEncyclopediaEntries, searchEncyclopedia } from '../model/encyclopedia.js'
import {
  createRailwayNetworkEncyclopediaProvider,
  EncyclopediaProviderRegistry
} from '../model/encyclopedia-provider.js'
import { selectRandomTrain } from '../model/random-train.js'
import { createTimetableRealtimeProvider, RealtimeProviderRegistry } from '../model/realtime-provider.js'
import { getPublicErrorMessage } from '../model/services.js'

function trainDetails(overrides = {}) {
  return {
    trainCode: 'G123',
    rawTrainCode: 'G123',
    startStation: '北京南',
    endStation: '上海虹桥',
    serviceDate: '2026-08-14',
    runsToday: true,
    realtime: { text: '列车正在前往上海虹桥站', currentIndex: 0 },
    trainStyle: 'CR400AF',
    corporation: '北京客运段',
    allocation: '北京南动车所',
    stops: [
      { station: '北京南', delay: 0 },
      { station: '上海虹桥', delay: 0 }
    ],
    ...overrides
  }
}

test('encyclopedia loads independent data files and searches case-insensitively', async () => {
  const exact = await searchEncyclopedia('cr400af')
  assert.equal(exact.entries[0].id, 'CR400AF')
  assert.equal(exact.entries[0].type, 'train')

  const line = await searchEncyclopedia('线路 京沪高铁')
  assert.equal(line.entries.length, 1)
  assert.equal(line.entries[0].id, '京沪高速铁路')

  const missing = await searchEncyclopedia('不存在的铁路条目')
  assert.deepEqual(missing.entries, [])

  const allEntries = await searchEncyclopedia('铁路')
  assert.ok(allEntries.entries.length > 0)

  const catalog = await loadEncyclopediaEntries()
  assert.ok(catalog.length >= 25)
  assert.ok(catalog.every((entry) => entry.id && entry.name && entry.summary))
})

test('encyclopedia provider dynamically supplements uncatalogued lines and stations', async () => {
  const calls = []
  const provider = createRailwayNetworkEncyclopediaProvider({
    queryRoute: async (keyword) => {
      calls.push(['line', keyword])
      return {
        name: '测试高速铁路',
        railType: '高速铁路',
        lineType: '复线铁路',
        designSpeed: '350 km/h',
        stations: [{ name: '甲站' }, { name: '乙站' }]
      }
    },
    queryStation: async (keyword) => {
      calls.push(['station', keyword])
      return {
        name: '测试站',
        type: '火车站',
        telecode: 'TST',
        operator: '测试单位',
        location: '测试市',
        connections: []
      }
    }
  })
  const registry = new EncyclopediaProviderRegistry([provider])

  const lineEntries = await registry.query({ type: 'line', keyword: '测试高铁' })
  assert.equal(lineEntries[0].type, 'line')
  assert.match(lineEntries[0].details.join('\n'), /沿途车站 2 座/u)

  const stationEntries = await registry.query({ type: 'station', keyword: '测试站' })
  assert.equal(stationEntries[0].type, 'station')
  assert.match(stationEntries[0].details.join('\n'), /电报码：TST/u)
  assert.deepEqual(calls, [['line', '测试高铁'], ['station', '测试站']])
})

test('timetable realtime provider maps existing train details into a replaceable provider result', async () => {
  const provider = createTimetableRealtimeProvider(async (input) => {
    assert.equal(input, 'G123 -实时')
    return trainDetails()
  })
  const registry = new RealtimeProviderRegistry([provider])
  const result = await registry.query('G123')

  assert.equal(result.providerId, 'timetable-estimate')
  assert.equal(result.status, '列车正在前往上海虹桥站')
  assert.equal(result.currentStation, '北京南')
  assert.equal(result.nextStation, '上海虹桥')
  assert.equal(result.delay, '正点')
  assert.match(formatRealtimeStatus(result), /当前状态：列车正在前往上海虹桥站/u)
})

test('random train retries failed candidates and reuses matching encyclopedia knowledge', async () => {
  const attempts = []
  const result = await selectRandomTrain({
    trainCodes: ['BAD', 'G123'],
    random: () => 0.999,
    knowledgeEntries: [{ id: 'CR400AF', name: '复兴号 CR400AF', aliases: [], fact: '示例知识' }],
    loadTrainDetails: async (code) => {
      attempts.push(code)
      if (code === 'BAD') throw new Error('not running')
      return trainDetails()
    }
  })

  assert.deepEqual(attempts, ['BAD', 'G123'])
  assert.equal(result.knowledge.id, 'CR400AF')
  assert.match(formatRandomTrain(result), /车次：G123/u)
  assert.match(formatRandomTrain(result), /铁路小知识：示例知识/u)
})

test('new feature text integrates with the existing help and formatter style', async () => {
  assert.match(ASSISTANT_HELP_TEXT, /#车次 G123/u)
  assert.match(ASSISTANT_HELP_TEXT, /#实时 G123/u)
  assert.match(ASSISTANT_HELP_TEXT, /#铁路百科 CR400AF/u)
  assert.match(ASSISTANT_HELP_TEXT, /#随机列车/u)

  const result = await searchEncyclopedia('HXD1D')
  const formatted = formatEncyclopedia(result)
  assert.match(formatted, /【铁路百科】和谐电 1D 型电力机车/u)
  assert.match(formatted, /资料来源：中国中车/u)
  assert.doesNotMatch(formatted, /https?:\/\//iu)
  assert.equal(
    getPublicErrorMessage({ code: 'PROVIDER_UNAVAILABLE' }),
    '列车实时状态数据源暂时不可用，请稍后再试'
  )
})
