import { spawn } from 'node:child_process'
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  buildRenderHtml,
  createBackgroundUrl,
  paginateTextByHeight,
  resolveRenderOptions,
  waitForBackground
} from '../model/render-text-image.js'

const STARTUP_TIMEOUT_MS = 15_000

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function fileExists(file) {
  if (!file) return false
  try {
    await access(file)
    return true
  } catch {
    return false
  }
}

async function removeChromeTempRoot(tempRoot) {
  const temporaryBase = path.resolve(tmpdir())
  const resolvedTarget = path.resolve(tempRoot)
  const relative = path.relative(temporaryBase, resolvedTarget)
  const safe = relative && !relative.startsWith('..') && !path.isAbsolute(relative) &&
    path.basename(resolvedTarget).startsWith('railwaytools-chrome-')
  if (!safe) throw new Error('Refusing to remove an unsafe Chrome temporary directory')
  await rm(resolvedTarget, { recursive: true, force: true })
}

export async function findChromeExecutable() {
  const configured = process.env.RAILWAYTOOLS_CHROME
  const programFiles = process.env.ProgramFiles
  const programFilesX86 = process.env['ProgramFiles(x86)']
  const localAppData = process.env.LOCALAPPDATA
  const candidates = [
    configured,
    process.platform === 'win32' && programFiles
      ? path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe')
      : '',
    process.platform === 'win32' && programFilesX86
      ? path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe')
      : '',
    process.platform === 'win32' && localAppData
      ? path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe')
      : '',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium'
  ].filter(Boolean)

  for (const candidate of candidates) {
    if (await fileExists(candidate)) return candidate
  }
  return null
}

class CdpClient {
  constructor(socket) {
    this.socket = socket
    this.nextId = 1
    this.pending = new Map()
    socket.addEventListener('message', (event) => this.handleMessage(event.data))
    socket.addEventListener('close', () => this.rejectPending(new Error('Chrome CDP connection closed')))
    socket.addEventListener('error', () => this.rejectPending(new Error('Chrome CDP connection failed')))
  }

  static async connect(url, timeoutMs = STARTUP_TIMEOUT_MS) {
    const socket = new WebSocket(url)
    try {
      await new Promise((resolve, reject) => {
        let settled = false
        const timer = setTimeout(() => finish(new Error('Chrome CDP connection timed out')), timeoutMs)
        const finish = (error) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          if (error) reject(error)
          else resolve()
        }
        socket.addEventListener('open', () => finish(), { once: true })
        socket.addEventListener('error', () => finish(new Error('Chrome CDP connection failed')), { once: true })
      })
    } catch (error) {
      try {
        socket.close()
      } catch {
        // A failed or timed-out connection may already be closed.
      }
      throw error
    }
    return new CdpClient(socket)
  }

  handleMessage(raw) {
    let message
    try {
      message = JSON.parse(String(raw))
    } catch {
      return
    }
    if (!message.id) return
    const pending = this.pending.get(message.id)
    if (!pending) return
    this.pending.delete(message.id)
    if (message.error) pending.reject(new Error(message.error.message ?? 'Chrome CDP command failed'))
    else pending.resolve(message.result)
  }

  rejectPending(error) {
    for (const pending of this.pending.values()) pending.reject(error)
    this.pending.clear()
  }

  send(method, params = {}, sessionId) {
    const id = this.nextId
    this.nextId += 1
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      try {
        this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
      } catch (error) {
        this.pending.delete(id)
        reject(error)
      }
    })
  }

  close() {
    try {
      this.socket.close()
    } catch {
      // Chrome may have already closed the debugging socket.
    }
  }
}

class ChromePage {
  constructor(client, sessionId, htmlRoot) {
    this.client = client
    this.sessionId = sessionId
    this.htmlRoot = htmlRoot
    this.htmlIndex = 0
  }

  send(method, params = {}) {
    return this.client.send(method, params, this.sessionId)
  }

  async initialize() {
    await this.send('Page.enable')
    await this.send('Runtime.enable')
  }

  async setViewport(viewport) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: viewport.deviceScaleFactor ?? 1,
      mobile: false
    })
  }

  async setContent(html, options = {}) {
    this.htmlIndex += 1
    const htmlPath = path.join(this.htmlRoot, `render-${this.htmlIndex}.html`)
    await writeFile(htmlPath, html, 'utf8')
    const navigation = await this.send('Page.navigate', { url: pathToFileURL(htmlPath).href })
    if (navigation?.errorText) throw new Error(`Chrome page navigation failed: ${navigation.errorText}`)

    const timeoutMs = Number(options.timeout) || 15_000
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      try {
        const ready = await this.evaluate(() => document.readyState === 'complete')
        if (ready) return
      } catch (error) {
        if (!/(?:execution context|Cannot find context)/iu.test(String(error?.message ?? error))) throw error
      }
      await delay(40)
    }
    throw new Error('Chrome page navigation timed out')
  }

  async evaluate(fn, ...args) {
    const serializedArgs = args.map((argument) => JSON.stringify(argument)).join(',')
    const response = await this.send('Runtime.evaluate', {
      expression: `(${String(fn)})(${serializedArgs})`,
      awaitPromise: true,
      returnByValue: true
    })
    if (response?.exceptionDetails) {
      const description = response.exceptionDetails.exception?.description
      throw new Error(description ?? response.exceptionDetails.text ?? 'Chrome page evaluation failed')
    }
    return response?.result?.value
  }

  async containerBounds() {
    const bounds = await this.evaluate(() => {
      const container = document.querySelector('#container')
      if (!container) return null
      const rect = container.getBoundingClientRect()
      return {
        x: rect.left + window.scrollX,
        y: rect.top + window.scrollY,
        width: Math.ceil(Math.max(rect.width, container.scrollWidth)),
        height: Math.ceil(Math.max(rect.height, container.scrollHeight)),
      }
    })
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
      throw new Error('Chrome result image container is missing')
    }
    return bounds
  }

  async captureContainer() {
    const bounds = await this.containerBounds()
    const screenshot = await this.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: true,
      clip: { ...bounds, scale: 1 },
    })
    if (!screenshot?.data) throw new Error('Chrome did not return screenshot data')
    return Buffer.from(screenshot.data, 'base64')
  }
}

async function waitForDevTools(userDataDir, chromeProcess, timeoutMs = STARTUP_TIMEOUT_MS) {
  const activePortPath = path.join(userDataDir, 'DevToolsActivePort')
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (chromeProcess.exitCode !== null) throw new Error('Chrome exited before CDP became ready')
    try {
      const [port, browserPath] = (await readFile(activePortPath, 'utf8')).trim().split(/\r?\n/u)
      if (port && browserPath) return `ws://127.0.0.1:${port}${browserPath}`
    } catch {
      // Chrome writes DevToolsActivePort after the debugging endpoint is ready.
    }
    await delay(50)
  }
  throw new Error('Chrome CDP startup timed out')
}

async function waitForProcessExit(chromeProcess, timeoutMs) {
  if (chromeProcess.exitCode !== null) return true
  return Promise.race([
    new Promise((resolve) => chromeProcess.once('exit', () => resolve(true))),
    delay(timeoutMs).then(() => false),
  ])
}

class ChromeRenderer {
  constructor({ chromeProcess, client, page, targetId, tempRoot }) {
    this.chromeProcess = chromeProcess
    this.client = client
    this.page = page
    this.targetId = targetId
    this.tempRoot = tempRoot
  }

  static async start(executable) {
    const tempRoot = await mkdtemp(path.join(tmpdir(), 'railwaytools-chrome-'))
    const userDataDir = path.join(tempRoot, 'profile')
    const htmlRoot = path.join(tempRoot, 'html')
    await mkdir(userDataDir, { recursive: true })
    await mkdir(htmlRoot, { recursive: true })

    const chromeArguments = [
      '--headless=new',
      '--disable-gpu',
      '--disable-extensions',
      '--no-first-run',
      '--no-default-browser-check',
      '--allow-file-access-from-files',
      '--remote-debugging-address=127.0.0.1',
      '--remote-debugging-port=0',
      `--user-data-dir=${userDataDir}`,
    ]
    if (process.platform === 'linux' && typeof process.getuid === 'function' && process.getuid() === 0) {
      chromeArguments.push('--no-sandbox')
    }
    chromeArguments.push('about:blank')
    const chromeProcess = spawn(executable, chromeArguments, { stdio: 'ignore', windowsHide: true })

    let client
    try {
      const websocketUrl = await waitForDevTools(userDataDir, chromeProcess)
      client = await CdpClient.connect(websocketUrl)
      const { targetId } = await client.send('Target.createTarget', { url: 'about:blank' })
      const { sessionId } = await client.send('Target.attachToTarget', { targetId, flatten: true })
      const page = new ChromePage(client, sessionId, htmlRoot)
      await page.initialize()
      return new ChromeRenderer({ chromeProcess, client, page, targetId, tempRoot })
    } catch (error) {
      client?.close()
      let cleanupError = null
      if (chromeProcess.exitCode === null) {
        if (!chromeProcess.kill()) {
          cleanupError = new Error('Unable to terminate Chrome after startup failure')
        } else if (!(await waitForProcessExit(chromeProcess, 2000)) && chromeProcess.exitCode === null) {
          cleanupError = new Error('Chrome did not exit after startup failure')
        }
      }
      try {
        await removeChromeTempRoot(tempRoot)
      } catch (temporaryError) {
        cleanupError ??= temporaryError
      }
      if (cleanupError) {
        throw new AggregateError([error, cleanupError], 'Chrome startup and cleanup failed')
      }
      throw error
    }
  }

  async render(text, options = {}) {
    const settings = resolveRenderOptions(options)
    await this.page.setViewport({
      width: Math.max(900, settings.maxWidth + 48),
      height: 1200,
      deviceScaleFactor: 1,
    })
    const pages = await paginateTextByHeight(this.page, text, settings)
    const buffers = []

    for (let index = 0; index < pages.length; index += 1) {
      const backgroundUrl = settings.backgroundUrl || createBackgroundUrl(Date.now(), Math.random() + index)
      await this.page.setContent(buildRenderHtml(pages[index], { ...settings, backgroundUrl }), {
        timeout: settings.setContentTimeoutMs,
      })
      if (settings.fontTimeoutMs > 0) {
        await this.page.evaluate(async (timeoutMs) => {
          if (!document.fonts?.ready) return
          await Promise.race([
            document.fonts.ready,
            new Promise((resolve) => setTimeout(resolve, timeoutMs)),
          ])
        }, settings.fontTimeoutMs)
      }
      await waitForBackground(this.page, settings.backgroundTimeoutMs)
      const bounds = await this.page.containerBounds()
      if (bounds.height > settings.maxPageHeight) {
        throw new RangeError('Chrome result image exceeds the maximum page height')
      }
      buffers.push(await this.page.captureContainer())
    }
    return buffers
  }

  async renderHtml(html, options = {}) {
    const settings = resolveRenderOptions(options)
    await this.page.setViewport({
      width: Math.max(900, settings.maxWidth + 48),
      height: 1200,
      deviceScaleFactor: 1,
    })
    await this.page.setContent(html, { timeout: settings.setContentTimeoutMs })
    if (settings.fontTimeoutMs > 0) {
      await this.page.evaluate(async (timeoutMs) => {
        if (!document.fonts?.ready) return
        await Promise.race([
          document.fonts.ready,
          new Promise((resolve) => setTimeout(resolve, timeoutMs)),
        ])
      }, settings.fontTimeoutMs)
    }
    await waitForBackground(this.page, settings.backgroundTimeoutMs)
    const bounds = await this.page.containerBounds()
    if (bounds.width < 360 || bounds.width > 720 || bounds.height > settings.maxPageHeight) {
      throw new RangeError(`Chrome structured image exceeds limits: ${bounds.width}x${bounds.height}`)
    }
    return [await this.page.captureContainer()]
  }

  async close() {
    let closeError = null
    try {
      await this.client.send('Target.closeTarget', { targetId: this.targetId })
    } catch {
      // The target may already be closed after a rendering failure.
    }
    try {
      await this.client.send('Browser.close')
    } catch {
      // The browser may close its CDP socket before acknowledging Browser.close.
    }
    this.client.close()
    if (!(await waitForProcessExit(this.chromeProcess, 2000)) && this.chromeProcess.exitCode === null) {
      if (!this.chromeProcess.kill()) closeError = new Error('Unable to terminate Chrome Headless')
      const exited = await waitForProcessExit(this.chromeProcess, 2000)
      if (!exited && this.chromeProcess.exitCode === null) {
        closeError = new Error('Chrome Headless did not exit after termination')
      }
    }
    await removeChromeTempRoot(this.tempRoot)
    if (closeError) throw closeError
  }
}

export async function createChromeRenderer() {
  if (typeof globalThis.WebSocket !== 'function') {
    return { renderer: null, note: '当前 Node.js 不提供 WebSocket，无法启动 Chrome Headless CDP 截图' }
  }
  const executable = await findChromeExecutable()
  if (!executable) {
    return { renderer: null, note: '当前工作区未检测到 Chrome 或 Chromium 可执行文件' }
  }
  const renderer = await ChromeRenderer.start(executable)
  return { renderer, note: 'Chrome Headless 临时 HTML（CDP 真实截图）' }
}
