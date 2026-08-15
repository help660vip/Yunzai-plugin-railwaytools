import assert from 'node:assert/strict'
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function loadFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'railwaytools-render-routing-'))
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
  const entry = await import(pathToFileURL(path.join(pluginRoot, 'index.js')).href + '?routing=' + Date.now())
  return { root, RailwayTools: entry.RailwayTools }
}

function createRenderRuntime({ failScreenshot = false } = {}) {
  const state = { browserInitCalls: 0, closeCalls: 0, html: '' }
  const page = {
    async setViewport() {},
    async setContent(html) { state.html = html },
    async evaluate(fn) {
      const source = String(fn)
      if (source.includes('document.fonts')) return undefined
      if (source.includes("document.querySelector('#background-image')")) return true
      if (source.includes('return Math.ceil')) return 320
      return { width: 480, height: 320 }
    },
    async $() {
      return {
        async screenshot() {
          if (failScreenshot) throw new Error('render failed')
          return Buffer.from('png')
        }
      }
    },
    async close() { state.closeCalls += 1 }
  }
  return {
    state,
    runtime: {
      puppeteer: {
        async browserInit() {
          state.browserInitCalls += 1
          return { newPage: async () => page }
        }
      }
    }
  }
}

let fixture
test.before(async () => { fixture = await loadFixture() })
test.after(async () => { await rm(fixture.root, { recursive: true, force: true }) })

test('railway detail handlers retain result-based rendering policies', async () => {
  const cases = [
    { handler: 'handleEmuNumber', msg: '#车号 G895', result: { records: [{}] }, empty: { records: [] } },
    { handler: 'handleTrainNumber', msg: '#车次 G895', result: { stops: [{}] }, empty: { stops: [] } },
    { handler: 'handleTrainNumber', msg: '#车次 CR400AF-1001', result: { records: [{}] }, empty: { records: [] } },
    { handler: 'handleTrainInfo', msg: '#查询 G895', result: { stops: [{}] }, empty: { stops: [] } },
    { handler: 'handleRealtime', msg: '#实时 G895', result: {}, empty: {}, always: true },
    { handler: 'handleStationScreen', msg: '#大屏 上海', result: { trains: [{}] }, empty: { trains: [] } },
    { handler: 'handleRoute', msg: '#线路 京沪高铁', result: {}, empty: {}, always: true },
    { handler: 'handleStation', msg: '#车站 上海', result: {}, empty: {}, always: true }
  ]
  for (const item of cases) {
    const instance = new fixture.RailwayTools()
    let invocation
    instance.e = { msg: item.msg }
    instance.execute = async (...args) => { invocation = args; return true }
    assert.equal(await instance[item.handler](), true)
    const options = invocation[4]
    assert.equal(options.shouldRender(item.result), true)
    assert.equal(options.shouldRender(item.empty), item.always === true)
  }
})

test('successful, empty and render-error branches reply exactly once', async (context) => {
  const previousSegment = globalThis.segment
  const previousLogger = globalThis.logger
  context.after(() => { globalThis.segment = previousSegment; globalThis.logger = previousLogger })
  globalThis.segment = { image: (buffer) => ({ type: 'image', buffer }) }
  globalThis.logger = { error() {} }

  const successRuntime = createRenderRuntime()
  const successReplies = []
  const success = new fixture.RailwayTools()
  success.e = { msg: '#车号 G895', runtime: successRuntime.runtime, reply: async (message) => successReplies.push(message) }
  await success.execute(['车号'], 'prompt', async () => ({ records: [{}] }), () => '成功详情', {
    shouldRender: (result) => result.records.length > 0
  })
  assert.equal(successReplies.length, 1)
  assert.equal(successReplies[0][0].type, 'image')

  const emptyRuntime = createRenderRuntime()
  const emptyReplies = []
  const empty = new fixture.RailwayTools()
  empty.e = { msg: '#车号 G895', runtime: emptyRuntime.runtime, reply: async (message) => emptyReplies.push(message) }
  await empty.execute(['车号'], 'prompt', async () => ({ records: [] }), () => '未查询到结果', {
    shouldRender: (result) => result.records.length > 0
  })
  assert.deepEqual(emptyReplies, ['未查询到结果'])
  assert.equal(emptyRuntime.state.browserInitCalls, 0)

  const failedRuntime = createRenderRuntime({ failScreenshot: true })
  const fallbackReplies = []
  const failed = new fixture.RailwayTools()
  failed.e = { msg: '#车号 G895', runtime: failedRuntime.runtime, reply: async (message) => fallbackReplies.push(message) }
  await failed.execute(['车号'], 'prompt', async () => ({ records: [{}] }), () => '保留原始文字', {
    shouldRender: () => true
  })
  assert.deepEqual(fallbackReplies, ['保留原始文字'])
  assert.equal(failedRuntime.state.closeCalls, 1)
})

test('main and ticket help use the compact menu renderer', async (context) => {
  const previousSegment = globalThis.segment
  context.after(() => { globalThis.segment = previousSegment })
  globalThis.segment = { image: (buffer) => ({ type: 'image', buffer }) }

  for (const [method, message, expected] of [
    ['showHelp', '#车迷帮助', '#查询车票'],
    ['showTicketHelp', '#车票帮助', '-精确站名']
  ]) {
    const runtime = createRenderRuntime()
    const replies = []
    const instance = new fixture.RailwayTools()
    instance.e = { msg: message, runtime: runtime.runtime, reply: async (reply) => replies.push(reply) }
    assert.equal(await instance[method](), true)
    assert.equal(replies[0][0].type, 'image')
    assert.match(runtime.state.html, new RegExp(expected, 'u'))
    assert.equal(runtime.state.closeCalls, 1)
  }
})

test('scheduled notifier mentions the user and falls back to the Yunzai conversation API', async (context) => {
  const previousSegment = globalThis.segment
  const previousBot = globalThis.Bot
  const previousLogger = globalThis.logger
  context.after(() => {
    globalThis.segment = previousSegment
    globalThis.Bot = previousBot
    globalThis.logger = previousLogger
  })
  globalThis.segment = { at: (userId) => ({ type: 'at', userId }) }
  globalThis.logger = { error() {} }
  const sent = []
  globalThis.Bot = { pickGroup: (groupId) => ({ sendMsg: async (message) => sent.push({ groupId, message }) }) }

  const instance = new fixture.RailwayTools()
  instance.e = {
    group_id: 100,
    user_id: 200,
    reply: async () => { throw new Error('event expired') }
  }
  await instance.createTicketNotifier()('定时查询结果', { render: false })
  assert.deepEqual(sent, [{
    groupId: 100,
    message: [{ type: 'at', userId: 200 }, '定时查询结果']
  }])
})
