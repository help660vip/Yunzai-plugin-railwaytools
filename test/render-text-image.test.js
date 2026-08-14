import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildRenderHtml,
  createBackgroundUrl,
  escapeHtml,
  paginateTextByHeight,
  renderTextImage,
  sanitizeRenderText,
  waitForBackground
} from '../model/render-text-image.js'

const REPOSITORY_LABEL = 'https://github.com/help660vip/Yunzai-plugin-railwaytools'

function contentFromHtml(html) {
  return html.match(/<pre class="query-content">([\s\S]*?)<\/pre>/u)?.[1]
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&amp;', '&') ?? ''
}

function createMeasuredPage({ heightForText = () => 300, screenshotError, backgroundLoaded = true } = {}) {
  const state = {
    closed: false,
    removedBackground: false,
    screenshotTexts: [],
    viewport: null,
    html: ''
  }

  const page = {
    async setViewport(viewport) {
      state.viewport = viewport
    },
    async setContent(html) {
      state.html = html
    },
    async evaluate(fn) {
      const source = String(fn)
      if (source.includes("document.querySelector('#background-image')")) {
        if (source.includes('image.remove()')) {
          state.removedBackground = true
          return undefined
        }
        return backgroundLoaded
      }
      const height = heightForText(contentFromHtml(state.html))
      return { width: 480, height }
    },
    async $(selector) {
      assert.equal(selector, '#container')
      return {
        async screenshot() {
          if (screenshotError) throw screenshotError
          const text = contentFromHtml(state.html)
          state.screenshotTexts.push(text)
          return Buffer.from(text)
        }
      }
    },
    async close() {
      state.closed = true
    }
  }
  return { page, state }
}

test('sanitizes unsafe controls without damaging Unicode, Emoji, or line breaks', () => {
  assert.equal(sanitizeRenderText('A\r\n中\u200B文😀\u202E\rB'), 'A\n中文😀\nB')
  assert.equal(escapeHtml(`<tag a="1">Tom & 'Jerry'</tag>`), '&lt;tag a=&quot;1&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/tag&gt;')
})

test('builds a dynamic escaped card with only the GitHub icon and repository footer', () => {
  const html = buildRenderHtml('<车次> G123 & 😀', {
    minWidth: 360,
    maxWidth: 720,
    backgroundUrl: 'https://example.test/background?a=1&b=2'
  })

  assert.match(html, /min-width: 360px/u)
  assert.match(html, /max-width: 720px/u)
  assert.match(html, /display: inline-block/u)
  assert.match(html, /width: max-content/u)
  assert.match(html, /white-space: pre-wrap/u)
  assert.match(html, /font-size: 17px/u)
  assert.match(html, /line-height: 1\.45/u)
  assert.match(html, /font-variant-numeric: tabular-nums/u)
  assert.match(html, /text-rendering: optimizeLegibility/u)
  assert.match(html, /\.query-content::first-line/u)
  assert.match(html, /font-size: 20px/u)
  assert.match(html, /Microsoft YaHei/u)
  assert.match(html, /Microsoft YaHei UI/u)
  assert.match(html, /WenQuanYi Micro Hei/u)
  assert.match(html, /Noto Sans CJK SC/u)
  assert.match(html, /justify-content: center/u)
  assert.match(html, /&lt;车次&gt; G123 &amp; 😀/u)
  assert.match(html, /<svg class="github-icon"/u)
  assert.match(html, new RegExp(REPOSITORY_LABEL.replaceAll('/', '\\/'), 'u'))
  assert.doesNotMatch(html, /Powered\s+by/iu)
  assert.doesNotMatch(html, /<h1/u)

  const clampedHtml = buildRenderHtml('正文', { minWidth: 1, maxWidth: 1 })
  assert.match(clampedHtml, /min-width: 360px/u)
  assert.match(clampedHtml, /max-width: 360px/u)
})

test('creates cache-busting background URLs', () => {
  const first = createBackgroundUrl(123, 0.1)
  const second = createBackgroundUrl(124, 0.2)
  assert.notEqual(first, second)
  assert.match(first, /^https:\/\/t\.alcy\.cc\/mp\?/u)
  assert.match(first, /[?&]t=123(?:&|$)/u)
  assert.match(first, /[?&]r=/u)
})

test('paginates only at logical line boundaries and preserves page order', async () => {
  const { page } = createMeasuredPage({
    heightForText: (text) => 400 + text.split('\n').length * 100
  })

  const pages = await paginateTextByHeight(page, '第一行\n第二行\n第三行', {
    maxPageHeight: 600,
    fontTimeoutMs: 0
  })
  assert.deepEqual(pages, ['第一行\n第二行', '第三行'])
})

test('preserves every line across many paginated pages', async () => {
  const { page } = createMeasuredPage({
    heightForText: (text) => 400 + text.split('\n').length * 100
  })
  const text = Array.from({ length: 120 }, (_, index) => `第 ${index + 1} 行`).join('\n')

  const pages = await paginateTextByHeight(page, text, {
    maxPageHeight: 900,
    fontTimeoutMs: 0
  })

  assert.ok(pages.length > 1)
  assert.equal(pages.join('\n'), text)
})

test('rejects a logical line that alone exceeds the page height', async () => {
  const { page } = createMeasuredPage({
    heightForText: (text) => text.includes('超长') ? 601 : 300
  })

  await assert.rejects(
    paginateTextByHeight(page, '超长单行', { maxPageHeight: 600, fontTimeoutMs: 0 }),
    { name: 'RangeError' }
  )
})

test('removes a failed background and keeps the solid fallback', async () => {
  const { page, state } = createMeasuredPage({ backgroundLoaded: false })
  assert.equal(await waitForBackground(page, 0), false)
  assert.equal(state.removedBackground, true)
})

test('returns ordered Buffer-backed image segments and always closes the page', async (context) => {
  const previousSegment = globalThis.segment
  context.after(() => { globalThis.segment = previousSegment })
  globalThis.segment = {
    image: (buffer) => ({ type: 'image', buffer })
  }

  const { page, state } = createMeasuredPage({
    heightForText: (text) => 400 + text.split('\n').length * 100,
    backgroundLoaded: false
  })
  const browser = { newPage: async () => page }
  const e = { runtime: { puppeteer: { browserInit: async () => browser } } }

  const images = await renderTextImage(e, '甲\n乙\n丙', {
    maxPageHeight: 600,
    fontTimeoutMs: 0,
    backgroundTimeoutMs: 0,
    backgroundUrl: 'https://example.test/background'
  })

  assert.equal(images.length, 2)
  assert.ok(images.every((item) => item.type === 'image' && Buffer.isBuffer(item.buffer)))
  assert.deepEqual(images.map((item) => item.buffer.toString()), ['甲\n乙', '丙'])
  assert.deepEqual(state.screenshotTexts, ['甲\n乙', '丙'])
  assert.equal(state.closed, true)
  assert.equal(state.removedBackground, true)
  assert.deepEqual(state.viewport, { width: 900, height: 1200, deviceScaleFactor: 1 })
})

test('closes the page when screenshotting fails', async (context) => {
  const previousSegment = globalThis.segment
  context.after(() => { globalThis.segment = previousSegment })
  globalThis.segment = { image: (buffer) => buffer }

  const { page, state } = createMeasuredPage({ screenshotError: new Error('screenshot failed') })
  const e = {
    runtime: {
      puppeteer: { browserInit: async () => ({ newPage: async () => page }) }
    }
  }

  await assert.rejects(
    renderTextImage(e, 'G123', { fontTimeoutMs: 0, backgroundTimeoutMs: 0 }),
    /screenshot failed/u
  )
  assert.equal(state.closed, true)
})

test('closes the page when the Yunzai image segment API is unavailable', async (context) => {
  const previousSegment = globalThis.segment
  context.after(() => { globalThis.segment = previousSegment })
  delete globalThis.segment

  const { page, state } = createMeasuredPage()
  const e = {
    runtime: {
      puppeteer: { browserInit: async () => ({ newPage: async () => page }) }
    }
  }

  await assert.rejects(
    renderTextImage(e, 'G123', { fontTimeoutMs: 0, backgroundTimeoutMs: 0 }),
    /image segment API is unavailable/u
  )
  assert.equal(state.closed, true)
})
