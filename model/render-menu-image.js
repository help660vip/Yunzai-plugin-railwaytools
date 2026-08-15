// deslop-ignore-file 19 -- Menu translucency is an explicit project visual requirement.
import {
  createBackgroundUrl,
  escapeHtml,
  githubIconSvg,
  REPOSITORY_LABEL,
  resolveRenderOptions,
  sanitizeRenderText,
  waitForBackground
} from './render-text-image.js'

function safe(value) {
  return escapeHtml(sanitizeRenderText(value))
}

function renderSections(sections = []) {
  return sections.map((section) => `
        <section class="menu-section">
          <h2>${safe(section.title)}</h2>
          <div class="command-list">
            ${(section.items ?? []).map((item) => `
              <div class="command-row">
                <code>${safe(item.command)}</code>
                <span>${safe(item.description)}</span>
              </div>`).join('')}
          </div>
        </section>`).join('')
}

export function buildMenuHtml(menu, options = {}) {
  const settings = resolveRenderOptions(options)
  const background = options.backgroundUrl
    ? `<img id="background-image" src="${safe(options.backgroundUrl)}" alt="">`
    : ''
  const notes = (menu.notes ?? []).map((note) => `<li>${safe(note)}</li>`).join('')
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: transparent; }
    body {
      padding: 8px;
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
      border-radius: 16px;
      background: #dfe6ec;
      box-shadow: 0 9px 24px rgba(17, 24, 39, .22);
    }
    #background-image { z-index: -3; position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
    .background-mask { z-index: -2; position: absolute; inset: 0; background: rgba(0, 0, 0, .12); }
    .menu {
      width: max-content;
      min-width: calc(${settings.minWidth}px - 16px);
      max-width: calc(${settings.maxWidth}px - 16px);
      margin: 8px;
      padding: 14px 16px 10px;
      border: 1px solid rgba(255, 255, 255, .18);
      border-radius: 11px;
      background: rgba(22, 24, 29, .54);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
    }
    header { padding-bottom: 7px; border-bottom: 1px solid rgba(255, 255, 255, .2); }
    h1 { margin: 0; color: #fff; font-size: 23px; line-height: 1.18; letter-spacing: .03em; }
    .subtitle { margin: 3px 0 0; color: rgba(255, 255, 255, .76); font-size: 13px; line-height: 1.3; }
    .menu-section { margin-top: 8px; }
    h2 {
      margin: 0 0 2px;
      padding-bottom: 3px;
      border-bottom: 1px solid rgba(255, 255, 255, .14);
      color: rgba(255, 255, 255, .72);
      font-size: 13px;
      font-weight: 600;
      line-height: 1.3;
      letter-spacing: .12em;
    }
    .command-list {
      display: grid;
      grid-template-columns: fit-content(330px) fit-content(260px);
      column-gap: 10px;
      width: max-content;
      max-width: 100%;
    }
    .command-row { display: contents; }
    .command-row code,
    .command-row span {
      align-items: baseline;
      padding: 3.5px 0;
      border-bottom: 1px solid rgba(255, 255, 255, .08);
    }
    .command-row:last-child code,
    .command-row:last-child span { border-bottom: 0; }
    code {
      color: #fff;
      font: 600 14px/1.3 "Microsoft YaHei", "Microsoft YaHei UI", "PingFang SC", "WenQuanYi Micro Hei", "Noto Sans CJK SC", sans-serif;
      overflow-wrap: anywhere;
    }
    .command-row span { color: rgba(255, 255, 255, .84); font-size: 12.75px; line-height: 1.35; overflow-wrap: anywhere; }
    .footer {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      margin-top: 7px;
      padding-top: 7px;
      border-top: 1px solid rgba(255, 255, 255, .16);
      color: rgba(255, 255, 255, .72);
      font-size: 12px;
      overflow-wrap: anywhere;
    }
    .github-icon { flex: 0 0 auto; width: 16px; height: 16px; }
  </style>
</head>
<body>
  <section id="container">
    ${background}
    <div class="background-mask"></div>
    <main class="menu">
      <header><h1>${safe(menu.title)}</h1><p class="subtitle">${safe(menu.subtitle)}</p></header>
      ${renderSections(menu.sections)}
      ${notes ? `<ul class="notes">${notes}</ul>` : ''}
      <footer class="footer">${githubIconSvg()}<span>${REPOSITORY_LABEL}</span></footer>
    </main>
  </section>
</body>
</html>`
}

export async function renderMenuImage(event, menu, options = {}) {
  const settings = resolveRenderOptions({ minWidth: 360, maxWidth: 640, ...options })
  const puppeteer = event?.runtime?.puppeteer
  if (typeof puppeteer?.browserInit !== 'function') throw new Error('TRSS-Yunzai Puppeteer runtime is unavailable')
  const browser = await puppeteer.browserInit()
  if (typeof browser?.newPage !== 'function') throw new Error('TRSS-Yunzai Puppeteer browser initialization failed')

  let page
  try {
    page = await browser.newPage()
    await page.setViewport?.({ width: settings.maxWidth + 48, height: 1200, deviceScaleFactor: 1 })
    const backgroundUrl = options.backgroundUrl || createBackgroundUrl()
    await page.setContent(buildMenuHtml(menu, { ...settings, backgroundUrl }), {
      waitUntil: 'domcontentloaded',
      timeout: settings.setContentTimeoutMs
    })
    if (settings.fontTimeoutMs > 0) {
      try {
        await page.evaluate(async (timeoutMs) => {
          if (!document.fonts?.ready) return
          await Promise.race([document.fonts.ready, new Promise((resolve) => setTimeout(resolve, timeoutMs))])
        }, settings.fontTimeoutMs)
      } catch {
        // System font fallback remains usable.
      }
    }
    await waitForBackground(page, settings.backgroundTimeoutMs)
    const height = await page.evaluate(() => {
      const container = document.querySelector('#container')
      if (!container) return 0
      const bounds = container.getBoundingClientRect()
      return Math.ceil(Math.max(bounds.height, container.scrollHeight))
    })
    if (!Number.isFinite(height) || height <= 0 || height > settings.maxPageHeight) {
      throw new RangeError('Rendered railway help menu exceeds the maximum page height')
    }
    const container = await page.$('#container')
    if (!container) throw new Error('Railway help menu container is missing')
    const buffer = Buffer.from(await container.screenshot({ type: 'png', omitBackground: false }))
    const image = globalThis.segment?.image
    if (typeof image !== 'function') throw new Error('Yunzai image segment API is unavailable')
    return [image(buffer)]
  } finally {
    try { await page?.close?.() } catch { /* Preserve the original render error. */ }
  }
}
