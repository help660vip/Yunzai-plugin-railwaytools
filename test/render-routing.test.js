import assert from 'node:assert/strict'
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { formatLocomotive } from '../model/formatters.js'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function loadRailwayToolsFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'railwaytools-render-routing-'))
  const pluginRoot = path.join(root, 'plugins', 'Yunzai-plugin-railwaytools')
  const baseDir = path.join(root, 'lib', 'plugins')
  await mkdir(pluginRoot, { recursive: true })
  await mkdir(baseDir, { recursive: true })

  for (const entry of ['apps', 'data', 'model', 'index.js', 'package.json']) {
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

  const entryUrl = pathToFileURL(path.join(pluginRoot, 'index.js')).href
  const entry = await import(entryUrl + '?render-routing=' + Date.now())
  return { root, RailwayTools: entry.RailwayTools }
}

function createRenderRuntime({ failScreenshot = false } = {}) {
  const state = { browserInitCalls: 0, closeCalls: 0 }
  const page = {
    html: '',
    async setViewport() {},
    async setContent(html) { this.html = html },
    async evaluate(fn) {
      const source = String(fn)
      if (source.includes("document.querySelector('#background-image')")) return true
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
test.before(async () => { fixture = await loadRailwayToolsFixture() })
test.after(async () => { await rm(fixture.root, { recursive: true, force: true }) })

test('all handlers declare result-based rendering and locomotive explicitly opts out', async () => {
  const cases = [
    { handler: 'handleEmuNumber', msg: '#车号 G895', result: { records: [{}] }, empty: { records: [] } },
    { handler: 'handleTrainNumber', msg: '#车次 G895', result: { stops: [{}] }, empty: { stops: [] } },
    { handler: 'handleTrainNumber', msg: '#车次 CR400AF-1001', result: { records: [{}] }, empty: { records: [] } },
    { handler: 'handleTrainInfo', msg: '#查询 G895', result: { stops: [{}] }, empty: { stops: [] } },
    { handler: 'handleRealtime', msg: '#实时 G895', result: {}, empty: {}, always: true },
    { handler: 'handleStationScreen', msg: '#大屏 上海', result: { trains: [{}] }, empty: { trains: [] } },
    { handler: 'handleRoute', msg: '#线路 京沪高铁', result: {}, empty: {}, always: true },
    { handler: 'handleStation', msg: '#车站 上海', result: {}, empty: {}, always: true },
    { handler: 'handleEncyclopedia', msg: '#铁路百科 CR400AF', result: { entries: [{}] }, empty: { entries: [] } },
    { handler: 'handleLocomotive', msg: '#机车信息 HXD1D-1898', render: false }
  ]

  for (const item of cases) {
    const instance = new fixture.RailwayTools()
    let invocation
    instance.e = { msg: item.msg }
    instance.execute = async (...args) => { invocation = args; return true }
    assert.equal(await instance[item.handler](), true)

    const options = invocation[4]
    if (item.render === false) {
      assert.equal(options.render, false, `${item.msg} must never use Puppeteer rendering`)
      continue
    }
    assert.equal(typeof options.shouldRender, 'function', `${item.msg} must declare shouldRender`)
    assert.equal(options.shouldRender(item.result), true)
    assert.equal(options.shouldRender(item.empty), item.always === true)
  }
})

test('random train uses the common query/reply pipeline and requests image rendering', async () => {
  const instance = new fixture.RailwayTools()
  let invocation
  instance.replyQuery = async (...args) => { invocation = args; return true }

  assert.equal(await instance.handleRandomTrain(), true)
  assert.equal(typeof invocation[0], 'function')
  assert.equal(typeof invocation[1], 'function')
  assert.equal(invocation[2].shouldRender({}), true)
})

test('successful, empty, query-error, and render-error branches reply exactly once', async (context) => {
  const previousSegment = globalThis.segment
  const previousLogger = globalThis.logger
  context.after(() => {
    globalThis.segment = previousSegment
    globalThis.logger = previousLogger
  })
  globalThis.segment = { image: (buffer) => ({ type: 'image', buffer }) }
  globalThis.logger = { error() {} }

  const successRuntime = createRenderRuntime()
  const successReplies = []
  const success = new fixture.RailwayTools()
  success.e = {
    msg: '#车号 G895',
    runtime: successRuntime.runtime,
    reply: async (message) => successReplies.push(message)
  }
  await success.execute(
    ['车号'],
    'prompt',
    async () => ({ records: [{}] }),
    () => '成功详情',
    { shouldRender: (result) => result.records.length > 0 }
  )
  assert.equal(successReplies.length, 1)
  assert.ok(Array.isArray(successReplies[0]))
  assert.equal(successReplies[0][0].type, 'image')

  const emptyRuntime = createRenderRuntime()
  const emptyReplies = []
  const empty = new fixture.RailwayTools()
  empty.e = {
    msg: '#车号 G895',
    runtime: emptyRuntime.runtime,
    reply: async (message) => emptyReplies.push(message)
  }
  await empty.execute(
    ['车号'],
    'prompt',
    async () => ({ records: [] }),
    () => '未查询到结果',
    { shouldRender: (result) => result.records.length > 0 }
  )
  assert.deepEqual(emptyReplies, ['未查询到结果'])
  assert.equal(emptyRuntime.state.browserInitCalls, 0)

  const errorReplies = []
  const queryError = new fixture.RailwayTools()
  queryError.e = {
    msg: '#车号 G895',
    reply: async (message) => errorReplies.push(message)
  }
  await queryError.execute(
    ['车号'],
    'prompt',
    async () => { throw new Error('upstream failed') },
    () => '不可到达',
    { shouldRender: () => true }
  )
  assert.equal(errorReplies.length, 1)
  assert.equal(typeof errorReplies[0], 'string')

  const failedRuntime = createRenderRuntime({ failScreenshot: true })
  const fallbackReplies = []
  const renderError = new fixture.RailwayTools()
  renderError.e = {
    msg: '#车号 G895',
    runtime: failedRuntime.runtime,
    reply: async (message) => fallbackReplies.push(message)
  }
  await renderError.execute(
    ['车号'],
    'prompt',
    async () => ({ records: [{}] }),
    () => '渲染失败后保留的原始文字',
    { shouldRender: () => true }
  )
  assert.deepEqual(fallbackReplies, ['渲染失败后保留的原始文字'])
  assert.equal(failedRuntime.state.closeCalls, 1)
})

test('help uses image rendering on success', async (context) => {
  const previousSegment = globalThis.segment
  context.after(() => { globalThis.segment = previousSegment })
  globalThis.segment = { image: (buffer) => ({ type: 'image', buffer }) }

  const renderRuntime = createRenderRuntime()
  const replies = []
  const instance = new fixture.RailwayTools()
  instance.e = {
    msg: '#车迷帮助',
    runtime: renderRuntime.runtime,
    reply: async (message) => replies.push(message)
  }

  assert.equal(await instance.showHelp(), true)
  assert.equal(replies.length, 1)
  assert.equal(replies[0][0].type, 'image')
})

test('locomotive keeps photo segments and plain text without exposing a project URL', async (context) => {
  const previousSegment = globalThis.segment
  context.after(() => { globalThis.segment = previousSegment })
  const photoSegment = (url) => ({ type: 'image', url })
  globalThis.segment = { image: photoSegment }

  const renderRuntime = createRenderRuntime()
  const replies = []
  const instance = new fixture.RailwayTools()
  instance.e = {
    msg: '#机车信息 HXD1D-1898',
    runtime: renderRuntime.runtime,
    reply: async (message) => replies.push(message)
  }
  const data = {
    trainId: 'HXD1D-1898',
    records: [{
      id: 'HXD1D-1898',
      allocation: '示例配属',
      manufacturer: '示例厂家',
      photoAuthor: '拍摄者',
      photoDate: '2026-08-14',
      photoUrl: 'https://images.example.test/HXD1D-1898.jpg'
    }]
  }

  await instance.execute(
    ['机车信息'],
    'prompt',
    async () => data,
    formatLocomotive,
    { render: false }
  )

  assert.equal(renderRuntime.state.browserInitCalls, 0)
  assert.equal(replies.length, 1)
  assert.ok(replies[0].some((part) => part?.type === 'image'))
  const text = replies[0].filter((part) => typeof part === 'string').join('\n')
  assert.match(text, /数据来源：轨上名录 CR-Locomotive-Allocation/u)
  assert.doesNotMatch(text, /https?:\/\//iu)
  assert.doesNotMatch(text, /github\.com\/leaf2006\/CR-Locomotive-Allocation/iu)
})

test('locomotive silently omits photo URLs when segment.image is missing', async (context) => {
  const previousSegment = globalThis.segment
  context.after(() => { globalThis.segment = previousSegment })
  delete globalThis.segment

  const renderRuntime = createRenderRuntime()
  const replies = []
  const instance = new fixture.RailwayTools()
  instance.e = {
    msg: '#机车信息 HXD1D-1898',
    runtime: renderRuntime.runtime,
    reply: async (message) => replies.push(message)
  }
  const data = {
    trainId: 'HXD1D-1898',
    records: [{
      id: 'HXD1D-1898',
      allocation: '示例配属',
      manufacturer: '示例厂家',
      photoAuthor: '',
      photoDate: '',
      photoUrl: 'https://images.example.test/HXD1D-1898.jpg'
    }]
  }

  await instance.execute(
    ['机车信息'],
    'prompt',
    async () => data,
    formatLocomotive,
    { render: false }
  )

  assert.equal(renderRuntime.state.browserInitCalls, 0)
  assert.equal(replies.length, 1)
  assert.ok(replies[0].every((part) => typeof part === 'string'))
  assert.doesNotMatch(replies[0].join('\n'), /https?:\/\//iu)
})
