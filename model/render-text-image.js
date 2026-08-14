const CONTROL_CHARACTERS_RE = /[\u061C\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/gu
const REPOSITORY_LABEL = 'https://github.com/help660vip/Yunzai-plugin-railwaytools'

export const DEFAULT_RENDER_OPTIONS = Object.freeze({
  title: '',
  minWidth: 360,
  maxWidth: 720,
  maxPageHeight: 4000,
  backgroundTimeoutMs: 12_000,
  fontTimeoutMs: 3_000,
  setContentTimeoutMs: 15_000
})

function clampNumber(value, fallback, minimum, maximum) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback
}

export function resolveRenderOptions(options = {}) {
  const minWidth = clampNumber(options.minWidth, DEFAULT_RENDER_OPTIONS.minWidth, 360, 720)
  const maxWidth = clampNumber(options.maxWidth, DEFAULT_RENDER_OPTIONS.maxWidth, minWidth, 720)

  return {
    title: String(options.title ?? DEFAULT_RENDER_OPTIONS.title),
    minWidth,
    maxWidth,
    maxPageHeight: clampNumber(
      options.maxPageHeight,
      DEFAULT_RENDER_OPTIONS.maxPageHeight,
      600,
      4000
    ),
    backgroundTimeoutMs: clampNumber(
      options.backgroundTimeoutMs,
      DEFAULT_RENDER_OPTIONS.backgroundTimeoutMs,
      0,
      12_000
    ),
    fontTimeoutMs: clampNumber(options.fontTimeoutMs, DEFAULT_RENDER_OPTIONS.fontTimeoutMs, 0, 5000),
    setContentTimeoutMs: clampNumber(
      options.setContentTimeoutMs,
      DEFAULT_RENDER_OPTIONS.setContentTimeoutMs,
      1000,
      30_000
    ),
    backgroundUrl: typeof options.backgroundUrl === 'string' ? options.backgroundUrl : null
  }
}

export function sanitizeRenderText(value) {
  return String(value ?? '')
    .replace(/\r\n?/gu, '\n')
    .replace(CONTROL_CHARACTERS_RE, '')
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function createBackgroundUrl(timestamp = Date.now(), randomValue = Math.random()) {
  const random = Math.floor(Number(randomValue) * 1_000_000_000).toString(36)
  return `https://t.alcy.cc/mp?t=${encodeURIComponent(timestamp)}&r=${random}`
}

function githubIconSvg() {
  return [
    '<svg class="github-icon" viewBox="0 0 24 24" aria-hidden="true">',
    '<path fill="currentColor" d="M12 .7a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2.23c-3.22.7-3.9-1.36-3.9-1.36-.52-1.34-1.28-1.7-1.28-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.57-.29-5.28-1.29-5.28-5.69 0-1.26.45-2.29 1.19-3.09-.12-.29-.52-1.47.11-3.05 0 0 .97-.31 3.16 1.18a10.9 10.9 0 0 1 5.76 0c2.2-1.49 3.16-1.18 3.16-1.18.63 1.58.23 2.76.11 3.05.74.8 1.19 1.83 1.19 3.09 0 4.42-2.72 5.4-5.3 5.69.42.36.78 1.07.78 2.15v3.19c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .7Z"/>',
    '</svg>'
  ].join('')
}

export function buildRenderHtml(text, options = {}) {
  const settings = resolveRenderOptions(options)
  const content = escapeHtml(sanitizeRenderText(text))
  const title = escapeHtml(sanitizeRenderText(settings.title))
  const titleHtml = title ? `<h1 class="title">${title}</h1>` : ''
  const backgroundUrl = options.backgroundUrl
    ? `<img id="background-image" src="${escapeHtml(options.backgroundUrl)}" alt="">`
    : ''

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: transparent; }
    body {
      padding: 24px;
      color: #f7f9fb;
      font-family: "Microsoft YaHei", "Microsoft YaHei UI", "PingFang SC", "WenQuanYi Micro Hei", "Noto Sans CJK SC", sans-serif;
    }
    #container {
      display: inline-block;
      isolation: isolate;
      position: relative;
      width: max-content;
      min-width: ${settings.minWidth}px;
      max-width: ${settings.maxWidth}px;
      overflow: hidden;
      border-radius: 22px;
      background: #dfe6ec;
      box-shadow: 0 14px 36px rgba(17, 24, 39, .25);
    }
    #background-image {
      z-index: -3;
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .background-mask {
      z-index: -2;
      position: absolute;
      inset: 0;
      background: rgba(0, 0, 0, .12);
    }
    .panel {
      margin: 18px;
      padding: 22px 24px 18px;
      border: 1px solid rgba(255, 255, 255, .18);
      border-radius: 14px;
      background: rgba(22, 24, 29, .54);
      box-shadow: 0 10px 28px rgba(15, 23, 42, .24);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
    }
    .title {
      margin: 0 0 14px;
      color: #fff;
      font-size: 22px;
      font-weight: 700;
      line-height: 1.3;
      overflow-wrap: anywhere;
    }
    .query-content {
      margin: 0;
      color: #f7f9fb;
      font: inherit;
      font-size: 17px;
      font-weight: 400;
      line-height: 1.45;
      letter-spacing: .01em;
      font-variant-numeric: tabular-nums;
      text-rendering: optimizeLegibility;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    .query-content::first-line {
      color: #fff;
      font-size: 20px;
      font-weight: 700;
      line-height: 1.35;
    }
    .footer {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      margin-top: 18px;
      padding-top: 13px;
      border-top: 1px solid rgba(255, 255, 255, .16);
      color: rgba(255, 255, 255, .78);
      font-size: 12px;
      line-height: 1.35;
      overflow-wrap: anywhere;
    }
    .github-icon { flex: 0 0 auto; width: 16px; height: 16px; }
  </style>
</head>
<body>
  <section id="container">
    ${backgroundUrl}
    <div class="background-mask"></div>
    <main class="panel">
      ${titleHtml}
      <pre class="query-content">${content}</pre>
      <footer class="footer">${githubIconSvg()}<span>${REPOSITORY_LABEL}</span></footer>
    </main>
  </section>
</body>
</html>`
}

async function setPageContent(page, text, settings, backgroundUrl = '') {
  await page.setContent(buildRenderHtml(text, { ...settings, backgroundUrl }), {
    waitUntil: 'domcontentloaded',
    timeout: settings.setContentTimeoutMs
  })

  if (settings.fontTimeoutMs <= 0) return
  try {
    await page.evaluate(async (timeoutMs) => {
      if (!document.fonts?.ready) return
      await Promise.race([
        document.fonts.ready,
        new Promise((resolve) => setTimeout(resolve, timeoutMs))
      ])
    }, settings.fontTimeoutMs)
  } catch {
    // Browser font APIs are optional; system fallback fonts can still be rendered.
  }
}

export async function measureContainer(page, text, options = {}) {
  const settings = resolveRenderOptions(options)
  await setPageContent(page, text, settings)
  const dimensions = await page.evaluate(() => {
    const container = document.querySelector('#container')
    if (!container) return null
    const bounds = container.getBoundingClientRect()
    return {
      width: Math.ceil(Math.max(bounds.width, container.scrollWidth)),
      height: Math.ceil(Math.max(bounds.height, container.scrollHeight))
    }
  })

  if (!dimensions || !Number.isFinite(dimensions.height) || dimensions.height <= 0) {
    throw new Error('Unable to measure the railway result image container')
  }
  return dimensions
}

export async function paginateTextByHeight(page, text, options = {}) {
  const settings = resolveRenderOptions(options)
  const normalized = sanitizeRenderText(text)
  const lines = normalized.split('\n')
  const pages = []
  let currentLines = []

  for (const line of lines) {
    const candidateLines = [...currentLines, line]
    const candidate = candidateLines.join('\n')
    const { height } = await measureContainer(page, candidate, settings)

    if (height <= settings.maxPageHeight) {
      currentLines = candidateLines
      continue
    }

    if (currentLines.length === 0) {
      throw new RangeError('A single logical line exceeds the maximum railway result image height')
    }

    pages.push(currentLines.join('\n'))
    currentLines = [line]
    const singleLineDimensions = await measureContainer(page, line, settings)
    if (singleLineDimensions.height > settings.maxPageHeight) {
      throw new RangeError('A single logical line exceeds the maximum railway result image height')
    }
  }

  pages.push(currentLines.join('\n'))
  return pages
}

export async function waitForBackground(page, timeoutMs = DEFAULT_RENDER_OPTIONS.backgroundTimeoutMs) {
  let loaded = false
  try {
    loaded = await page.evaluate(async (maximumWait) => {
      const image = document.querySelector('#background-image')
      if (!image) return false
      if (image.complete) return image.naturalWidth > 0

      return new Promise((resolve) => {
        let settled = false
        const finish = (result) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          resolve(result)
        }
        const timer = setTimeout(() => finish(false), maximumWait)
        image.addEventListener('load', () => finish(image.naturalWidth > 0), { once: true })
        image.addEventListener('error', () => finish(false), { once: true })
      })
    }, timeoutMs)
  } catch {
    loaded = false
  }

  if (!loaded) {
    try {
      await page.evaluate(() => {
        const image = document.querySelector('#background-image')
        if (image) image.remove()
      })
    } catch {
      // The solid container background remains available even if DOM cleanup fails.
    }
  }
  return loaded
}

async function screenshotPage(page, text, settings, pageIndex) {
  const backgroundUrl = settings.backgroundUrl || createBackgroundUrl(Date.now(), Math.random() + pageIndex)
  await setPageContent(page, text, settings, backgroundUrl)
  await waitForBackground(page, settings.backgroundTimeoutMs)

  const { height } = await page.evaluate(() => {
    const container = document.querySelector('#container')
    if (!container) return { height: 0 }
    const bounds = container.getBoundingClientRect()
    return { height: Math.ceil(Math.max(bounds.height, container.scrollHeight)) }
  })
  if (!Number.isFinite(height) || height <= 0 || height > settings.maxPageHeight) {
    throw new RangeError('Rendered railway result image exceeds the maximum page height')
  }

  const container = await page.$('#container')
  if (!container) throw new Error('Railway result image container is missing')
  return container.screenshot({ type: 'png', omitBackground: false })
}

export async function renderTextImage(e, text, options = {}) {
  const settings = resolveRenderOptions(options)
  const puppeteer = e?.runtime?.puppeteer
  if (typeof puppeteer?.browserInit !== 'function') {
    throw new Error('TRSS-Yunzai Puppeteer runtime is unavailable')
  }

  const browser = await puppeteer.browserInit()
  if (typeof browser?.newPage !== 'function') {
    throw new Error('TRSS-Yunzai Puppeteer browser initialization failed')
  }

  let page
  try {
    page = await browser.newPage()
    if (typeof page.setViewport === 'function') {
      await page.setViewport({
        width: Math.max(900, settings.maxWidth + 48),
        height: 1200,
        deviceScaleFactor: 1
      })
    }

    const pages = await paginateTextByHeight(page, text, settings)
    const buffers = []
    for (let index = 0; index < pages.length; index += 1) {
      const screenshot = await screenshotPage(page, pages[index], settings, index)
      buffers.push(Buffer.from(screenshot))
    }

    const image = globalThis.segment?.image
    if (typeof image !== 'function') {
      throw new Error('Yunzai image segment API is unavailable')
    }
    return buffers.map((buffer) => image(buffer))
  } finally {
    if (page && typeof page.close === 'function') {
      try {
        await page.close()
      } catch {
        // Never replace the query/render failure with a page cleanup failure.
      }
    }
  }
}
