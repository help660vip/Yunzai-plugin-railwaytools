import assert from 'node:assert/strict'
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function createYunzaiFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'railwaytools-yunzai-'))
  const pluginRoot = path.join(root, 'plugins', 'Yunzai-plugin-railwaytools')
  const baseDir = path.join(root, 'lib', 'plugins')
  await mkdir(pluginRoot, { recursive: true })
  await mkdir(baseDir, { recursive: true })

  for (const entry of ['apps', 'model', 'index.js', 'package.json']) {
    await cp(path.join(projectRoot, entry), path.join(pluginRoot, entry), { recursive: true })
  }

  await writeFile(path.join(root, 'package.json'), '{"type":"module"}\n')
  await writeFile(path.join(baseDir, 'plugin.js'), [
    'export default class plugin {',
    '  constructor(config = {}) { Object.assign(this, config) }',
    '  reply(message) { return this.e.reply(message) }',
    '}',
    ''
  ].join('\n'))

  return { root, pluginRoot }
}

function trainDetailResponse() {
  return {
    data: {
      trainDetail: {
        stationTrainCodeAll: 'G123',
        stopTime: [
          {
            stationName: '北京南',
            stationTrainCode: 'G123',
            start_station_name: '北京南',
            end_station_name: '上海虹桥',
            jiaolu_corporation_code: '北京客运段',
            jiaolu_train_style: 'CR400AF',
            jiaolu_dept_train: '北京南动车所',
            arriveTime: '0000',
            startTime: '0800',
            stopover_time: '0',
            ticketDelay: '0',
            dayDifference: '0'
          },
          {
            stationName: '上海虹桥',
            stationTrainCode: 'G123',
            arriveTime: '1230',
            startTime: '0000',
            stopover_time: '0',
            ticketDelay: '0',
            dayDifference: '0'
          }
        ]
      }
    }
  }
}

test('loads through the Yunzai entry and routes required commands', async (context) => {
  const previousLogger = globalThis.logger
  globalThis.logger = { error() {} }
  context.after(() => {
    if (previousLogger === undefined) delete globalThis.logger
    else globalThis.logger = previousLogger
  })

  const { root, pluginRoot } = await createYunzaiFixture()
  context.after(() => rm(root, { recursive: true, force: true }))

  const entryUrl = pathToFileURL(path.join(pluginRoot, 'index.js')).href
  const entry = await import(entryUrl + '?test=' + Date.now())
  assert.equal(typeof entry.RailwayTools, 'function')

  const plugin = new entry.RailwayTools()
  assert.equal(plugin.event, 'message')
  assert.ok(Array.isArray(plugin.rule))

  const matches = (message) => plugin.rule.filter((rule) => new RegExp(rule.reg).test(message))
  assert.equal(matches('#车次 G123').length, 1)
  assert.equal(matches('#车次 g123').length, 1)
  assert.equal(matches('#车次    G123 ').length, 1)
  assert.equal(matches('#车迷帮助').length, 1)
  assert.equal(matches('#实时 g123').length, 1)
  assert.equal(matches('#查询车票 北京南 上海虹桥 明天').length, 1)
  assert.equal(matches('#定时查询车票 湖州 厦门北 14-16 10分钟').length, 1)
  assert.equal(matches('#取消查询车票').length, 1)
  assert.equal(matches('#车票帮助').length, 1)
  assert.equal(matches('#下一页').length, 1)
  assert.equal(matches('next').length, 1)
  assert.equal(matches('#机车信息 HXD1D-1898').length, 0)
  assert.equal(matches('#铁路百科 CR400AF').length, 0)
  assert.equal(matches('#随机列车').length, 0)
  assert.equal(matches('/' + '车次 G123').length, 0)
  assert.equal(matches('/' + 'help').length, 0)

  const requestedCodes = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes('travelServiceQrcodeTrainInfo')) {
      requestedCodes.push(new URLSearchParams(String(options.body)).get('trainCode'))
      return new Response(JSON.stringify(trainDetailResponse()), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    }
    if (String(url).includes('api.rail.re/train/')) {
      return new Response('[]', { status: 200 })
    }
    throw new Error('Unexpected URL: ' + url)
  }
  context.after(() => {
    globalThis.fetch = originalFetch
  })

  for (const message of ['#车次 G123', '#车次 g123', '#车次    G123 ']) {
    const replies = []
    const instance = new entry.RailwayTools()
    instance.e = { msg: message, reply: async (reply) => replies.push(reply) }
    assert.equal(await instance.handleTrainNumber(), true)
    assert.ok(String(replies.at(-1)).includes('车次：G123'))
  }
  assert.deepEqual(requestedCodes, ['G123'])

  const helpReplies = []
  const help = new entry.RailwayTools()
  help.e = { msg: '#车迷帮助', reply: async (reply) => helpReplies.push(reply) }
  assert.equal(await help.showHelp(), true)
  assert.match(helpReplies[0], /【车迷工具箱】/u)
  assert.match(helpReplies[0], /#车次 G123/u)
  assert.match(helpReplies[0], /#实时 G123/u)
  assert.match(helpReplies[0], /#查询车票 北京南 上海虹桥 明天/u)
  assert.match(helpReplies[0], /#下一页 \/ next/u)

  const ticketHelpReplies = []
  const ticketHelp = new entry.RailwayTools()
  ticketHelp.e = { msg: '#车票帮助', reply: async (reply) => ticketHelpReplies.push(reply) }
  assert.equal(await ticketHelp.showTicketHelp(), true)
  assert.match(ticketHelpReplies[0], /【车票查询帮助】/u)
  assert.match(ticketHelpReplies[0], /-精确站名/u)
})
