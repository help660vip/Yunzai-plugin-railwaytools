import { access, mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { createChromeRenderer } from './chrome-renderer.js'

import {
  ASSISTANT_HELP_TEXT,
  formatEncyclopedia,
  formatRandomTrain,
  formatRealtimeStatus
} from '../model/assistant-formatters.js'
import {
  queryEncyclopedia,
  queryRandomTrain,
  queryRealtimeStatus
} from '../model/assistant-services.js'
import {
  formatEmuAssignments,
  formatLocomotive,
  formatRoute,
  formatStation,
  formatStationScreen,
  formatTrainAssignments,
  formatTrainDetails
} from '../model/formatters.js'
import { renderTextImage } from '../model/render-text-image.js'
import {
  queryEmuAssignments,
  queryLocomotive,
  queryRoute,
  queryStation,
  queryStationScreen,
  queryTrainAssignments,
  queryTrainDetails
} from '../model/services.js'

const testRoot = path.dirname(fileURLToPath(import.meta.url))
const pluginRoot = path.resolve(testRoot, '..')
const imageRoot = path.join(testRoot, 'images')
const reportPath = path.join(testRoot, 'report.md')
const trainCandidates = ['G895', 'G6005', 'C7213', 'D169', 'T222']
const routeCandidates = ['京沪高速铁路', '京沪高铁', '京广高速铁路']
const artifactPrefixes = Object.freeze({
  '#车迷帮助': 'help',
  '#车号': 'emu-number',
  '#车次': 'train-number',
  '#查询': 'train-query',
  '#实时': 'realtime',
  '#大屏': 'station-screen',
  '#线路': 'route',
  '#车站': 'station',
  '#机车信息': 'locomotive',
  '#铁路百科': 'encyclopedia',
  '#随机列车': 'random-train'
})

const results = []
let screenshotRuntime = null
let chromeRenderer = null
let screenshotInitializationError = null
let imageStagingRoot = null
let screenshotRuntimeNote = ''

function errorText(error) {
  return String(error?.message ?? error).replaceAll('|', '\\|').replaceAll('\n', ' ')
}

function record(command, parameter, status, note, images = []) {
  results.push({ command, parameter, status, note, images })
}

function expectedOutput(command) {
  if (command === '#机车信息') return '实拍图消息段与普通文字，不进行 Puppeteer 渲染'
  return '有效结果为 Puppeteer 图片；空结果、错误或渲染失败为普通文字'
}

function actualOutput(result) {
  if (result.command === '#机车信息' && result.status === 'PASS') return '实拍图消息段与普通文字'
  if (result.status === 'PASS') {
    const renderer = screenshotRuntime ? 'TRSS-Yunzai Puppeteer' : 'Chrome Headless'
    return `${result.images.length} 张真实 PNG（${renderer}）`
  }
  if (result.status === 'SKIP-IMAGE') return '业务文字已生成；图片未生成'
  if (result.status === 'EMPTY') return '普通文字空结果'
  if (result.status === 'SKIP') return '未执行派生查询'
  return '无成功输出'
}

async function fileExists(file) {
  try {
    await access(file)
    return true
  } catch {
    return false
  }
}

async function loadTrssPuppeteer() {
  const modulePath = path.resolve(pluginRoot, '..', '..', 'lib', 'puppeteer', 'puppeteer.js')
  if (!(await fileExists(modulePath))) {
    screenshotRuntimeNote = '当前工作区未检测到 TRSS-Yunzai Puppeteer 运行时'
    return null
  }

  try {
    const module = await import(pathToFileURL(modulePath).href)
    const puppeteer = module.default ?? module.puppeteer ?? module
    if (typeof puppeteer?.browserInit !== 'function') {
      screenshotRuntimeNote = 'TRSS-Yunzai Puppeteer 模块没有 browserInit()'
      return null
    }
    screenshotRuntimeNote = '已加载 TRSS-Yunzai Puppeteer：lib/puppeteer/puppeteer.js'
    return puppeteer
  } catch (error) {
    screenshotRuntimeNote = `TRSS-Yunzai Puppeteer 加载失败（${error?.name ?? 'Error'}）`
    return null
  }
}

async function initializeScreenshotRuntime() {
  screenshotRuntime = await loadTrssPuppeteer()
  if (screenshotRuntime) return
  try {
    const fallback = await createChromeRenderer()
    chromeRenderer = fallback.renderer
    screenshotRuntimeNote = fallback.note
  } catch (error) {
    screenshotInitializationError = error
    screenshotRuntimeNote = `Chrome Headless 启动失败（${error?.name ?? 'Error'}）`
  }
}

function hasScreenshotRuntime() {
  return Boolean(screenshotRuntime || chromeRenderer)
}

function safeFileName(value) {
  return value.replace(/[^a-z0-9-]+/giu, '-').replace(/^-+|-+$/gu, '').toLowerCase()
}

function assertSafeArtifactDirectory(directory, prefix) {
  const resolvedRoot = path.resolve(testRoot)
  const resolvedDirectory = path.resolve(directory)
  const relative = path.relative(resolvedRoot, resolvedDirectory)
  const safe = relative && !relative.startsWith('..') && !path.isAbsolute(relative) &&
    path.basename(resolvedDirectory).startsWith(prefix)
  if (!safe) throw new Error('Refusing to modify an unsafe image artifact directory')
  return resolvedDirectory
}

async function removeArtifactDirectory(directory, prefix) {
  const safeDirectory = assertSafeArtifactDirectory(directory, prefix)
  await rm(safeDirectory, { recursive: true, force: true })
}

async function createImageStagingDirectory() {
  const staging = await mkdtemp(path.join(testRoot, '.images-staging-'))
  assertSafeArtifactDirectory(staging, '.images-staging-')
  return staging
}

async function replaceImageDirectory(staging) {
  const safeStaging = assertSafeArtifactDirectory(staging, '.images-staging-')
  const backup = path.join(testRoot, `.images-backup-${process.pid}-${Date.now()}`)
  assertSafeArtifactDirectory(backup, '.images-backup-')
  const hadExisting = await fileExists(imageRoot)
  if (hadExisting) await rename(imageRoot, backup)
  try {
    await rename(safeStaging, imageRoot)
  } catch (error) {
    if (hadExisting && await fileExists(backup)) await rename(backup, imageRoot)
    throw error
  }
  if (hadExisting) await removeArtifactDirectory(backup, '.images-backup-')
}

function readPngDimensions(buffer) {
  const isPng = Buffer.isBuffer(buffer) && buffer.length >= 24 &&
    buffer.readUInt32BE(0) === 0x89504e47 && buffer.toString('ascii', 12, 16) === 'IHDR'
  if (!isPng) throw new TypeError('渲染结果不是有效 PNG')
  const width = buffer.readUInt32BE(16)
  const height = buffer.readUInt32BE(20)
  if (width < 360 || width > 720 || height <= 0 || height > 4000) {
    throw new RangeError(`PNG 尺寸超出验收范围：${width}×${height}`)
  }
  return { width, height }
}

async function renderArtifact(command, parameter, text) {
  if (!hasScreenshotRuntime()) return []

  let buffers
  if (chromeRenderer) {
    buffers = await chromeRenderer.render(text)
  } else {
    const previousSegment = globalThis.segment
    globalThis.segment = { image: (buffer) => ({ buffer }) }
    try {
      const segments = await renderTextImage({ runtime: { puppeteer: screenshotRuntime } }, text)
      buffers = segments.map((segment) => segment?.buffer)
    } finally {
      globalThis.segment = previousSegment
    }
  }

  const prefix = artifactPrefixes[command] ?? 'result'
  const stem = safeFileName(`${prefix}-${parameter || 'default'}`)
  const files = []
  for (let index = 0; index < buffers.length; index += 1) {
    const buffer = buffers[index]
    if (!Buffer.isBuffer(buffer)) throw new TypeError('渲染结果不是 Buffer 图片段')
    const fileName = `${stem}-${index + 1}.png`
    const dimensions = readPngDimensions(buffer)
    await writeFile(path.join(imageStagingRoot, fileName), buffer)
    files.push({ file: `images/${fileName}`, ...dimensions })
  }
  return files
}

async function recordFormatted(
  command,
  parameter,
  data,
  formatter,
  hasResult,
  { render = true, requireImagePart = false } = {}
) {
  const formatted = formatter(data)
  if (!hasResult) {
    record(command, parameter, 'EMPTY', '接口成功返回，但没有可展示的有效记录')
    return formatted
  }
  if (!render || typeof formatted !== 'string') {
    if (requireImagePart) {
      const hasImagePart = Array.isArray(formatted) && formatted.some(
        (part) => part?.type === 'image' && typeof part.url === 'string' && part.url.length > 0
      )
      if (!hasImagePart) throw new Error(`${command} 的格式化结果缺少实拍图消息段`)
    }
    const text = Array.isArray(formatted)
      ? formatted.filter((part) => typeof part === 'string').join('\n')
      : String(formatted)
    if (/https?:\/\//iu.test(text)) throw new Error(`${command} 的文字回复包含 URL`)
    record(command, parameter, 'PASS', '保持原生消息；未调用 Puppeteer')
    return formatted
  }

  try {
    const images = await renderArtifact(command, parameter, formatted)
    if (hasScreenshotRuntime()) {
      record(command, parameter, 'PASS', `生成 ${images.length} 张真实截图`, images)
    } else if (screenshotInitializationError) {
      record(command, parameter, 'FAIL-IMAGE', 'Chrome Headless 已检测到但启动失败')
    } else {
      record(command, parameter, 'SKIP-IMAGE', '业务结果有效；当前环境没有可用的 TRSS 或 Chrome CDP 截图运行时')
    }
  } catch (error) {
    record(command, parameter, 'FAIL-IMAGE', errorText(error))
  }
  return formatted
}

async function attempt(command, parameter, query, formatter, hasResult, options) {
  try {
    const data = await query(parameter)
    await recordFormatted(command, parameter, data, formatter, hasResult(data), options)
    return data
  } catch (error) {
    record(command, parameter, 'FAIL', errorText(error))
    return null
  }
}

async function attemptWithRetries(
  command,
  parameter,
  query,
  formatter,
  hasResult,
  options,
  retries = 2
) {
  let lastError = null
  for (let attemptIndex = 0; attemptIndex < retries; attemptIndex += 1) {
    try {
      const data = await query(parameter)
      await recordFormatted(command, parameter, data, formatter, hasResult(data), options)
      return data
    } catch (error) {
      lastError = error
      if (attemptIndex + 1 < retries) {
        await new Promise((resolve) => setTimeout(resolve, 250))
      }
    }
  }
  record(command, parameter, 'FAIL', `${errorText(lastError)}（已尝试 ${retries} 次）`)
  return null
}

async function findTrainDetails() {
  let firstValid = null
  for (const trainCode of trainCandidates) {
    try {
      const data = await queryTrainDetails(trainCode)
      const hasResult = data.stops.length > 0
      await recordFormatted('#查询', trainCode, data, formatTrainDetails, hasResult)
      if (hasResult && !firstValid) firstValid = data
    } catch (error) {
      record('#查询', trainCode, 'FAIL', errorText(error))
    }
  }
  return firstValid
}

async function findEmuAssignments() {
  for (const trainCode of trainCandidates) {
    try {
      const data = await queryEmuAssignments(trainCode)
      const hasResult = data.records.length > 0
      await recordFormatted('#车号', trainCode, data, formatEmuAssignments, hasResult)
      if (hasResult) return data
    } catch (error) {
      record('#车号', trainCode, 'FAIL', errorText(error))
    }
  }
  return null
}

async function findRoute() {
  for (const route of routeCandidates) {
    try {
      const data = await queryRoute(route)
      await recordFormatted('#线路', route, data, formatRoute, true)
      return data
    } catch (error) {
      record('#线路', route, 'FAIL', errorText(error))
    }
  }
  return null
}

function reportMarkdown(startedAt) {
  const rows = results.map((result) => {
    const artifact = result.images.length > 0
      ? result.images.map((image) => `[${image.file}](${image.file})`).join('<br>')
      : 'SKIP（无截图）'
    const imageCheck = result.images.length > 0
      ? [
          `数量=${result.images.length}`,
          `尺寸=${result.images.map((image) => `${image.width}×${image.height}`).join('、')}`,
          `分页=${result.images.length > 1 ? `${result.images.length} 页，按生成顺序` : '单页'}`,
          '字体/背景/GitHub完整地址=https://github.com/help660vip/Yunzai-plugin-railwaytools；请查看真实 PNG'
        ].join('；')
      : result.command === '#机车信息'
        ? 'SKIP（按产品规则不使用 Puppeteer）'
        : result.status.startsWith('FAIL')
          ? 'FAIL（未生成 PNG；数量、尺寸、分页、字体、背景与 GitHub 页脚均未通过）'
          : 'SKIP（未生成 PNG；数量、尺寸、分页、字体、背景与 GitHub 页脚均未验收）'
    const trigger = `${result.command}${result.parameter ? ` ${result.parameter}` : ''}`
    return `| ${trigger} | ${expectedOutput(result.command)} | ${actualOutput(result)} | ${result.status} | ${imageCheck} | ${result.note} | ${artifact} |`
  })
  return [
    '# 命令渲染测试报告',
    '',
    `- 执行时间：${startedAt}`,
    `- Node.js：${process.version}`,
    `- 平台：${process.platform} ${process.arch}`,
    `- 截图环境：${screenshotRuntimeNote}`,
    '- 命令实现文件：`apps/railway-tools.js`',
    '- 触发格式：Yunzai 消息事件中的 `#命令 参数`；英文参数大小写不敏感并兼容连续空白。',
    '- 数据策略：直接调用当前插件的真实上游接口，不使用伪造成功数据。',
    '',
    '| 实际触发格式 | 预期输出 | 实际输出 | 结果 | 图片验收 | 说明 | 截图 |',
    '|---|---|---|---|---|---|---|',
    ...rows,
    '',
    '## 判定说明',
    '',
    '- `PASS`：业务查询和预期输出方式均成功；截图链接由 TRSS-Yunzai 共享 Puppeteer 或测试专用 Chrome Headless 实际生成。',
    '- `SKIP-IMAGE`：业务查询成功，但当前 Node.js 没有 WebSocket 或未检测到 TRSS、Chrome/Chromium；图片验收未假定通过。',
    '- `EMPTY`：真实接口没有返回有效记录，保持普通文字空结果。',
    '- `FAIL` / `FAIL-IMAGE`：真实接口或截图运行失败，错误已如实记录。',
    '- `#机车信息` 按产品规则保留实拍图消息段与普通文字，不进行 Puppeteer 渲染，文字中不得包含 URL。',
    '- 图片页脚显示完整地址 `https://github.com/help660vip/Yunzai-plugin-railwaytools`；该 URL 仅存在于图片像素中。',
    ''
  ].join('\n')
}

function imageReadmeMarkdown() {
  const images = results.flatMap((result) => result.images)
  const runtimeName = screenshotRuntime
    ? 'TRSS-Yunzai 共享 Puppeteer'
    : chromeRenderer
      ? 'Chrome Headless 临时 HTML（CDP）'
      : ''
  const state = runtimeName
    ? images.length > 0
      ? `本次通过 ${runtimeName} 生成 ${images.length} 个真实 PNG。`
      : `本次已加载 ${runtimeName}，但没有成功生成 PNG；请查看测试报告。`
    : '当前环境没有可用截图运行时，未生成 PNG；报告中的截图验收明确标记为 SKIP。'
  return [
    '# 渲染测试图片',
    '',
    state,
    '',
    '本目录不保存占位图。测试运行器先在临时 staging 中生成并校验全部 PNG，成功后整体替换本目录；失败时保留既有产物。',
    ...(images.length > 0
      ? ['', ...images.map((image) => `- [${image.file}](${path.basename(image.file)})：${image.width}×${image.height}`)]
      : []),
    ''
  ].join('\n')
}

async function main() {
  const startedAt = new Date().toISOString()
  imageStagingRoot = await createImageStagingDirectory()

  try {
    await initializeScreenshotRuntime()
    await recordFormatted('#车迷帮助', '', ASSISTANT_HELP_TEXT, (text) => text, true)

    const details = await findTrainDetails()
    if (details) {
      await recordFormatted('#车次', details.rawTrainCode, details, formatTrainDetails, details.stops.length > 0)
      await attempt('#实时', details.rawTrainCode, queryRealtimeStatus, formatRealtimeStatus, () => true)

      const emu = await findEmuAssignments()
      const emuNumber = emu?.records?.find((item) => item.emuNumber)?.emuNumber
      if (emuNumber) {
        await attemptWithRetries(
          '#车次',
          emuNumber,
          queryTrainAssignments,
          formatTrainAssignments,
          (data) => data.records.length > 0,
          undefined,
          2
        )
      } else {
        record('#车次', '由真实车组担当结果派生', 'SKIP', '没有可用于反查的真实动车组号')
      }

      const station = details.stops.find((stop) => stop.station)?.station
      if (station) {
        await attempt(
          '#大屏',
          station,
          queryStationScreen,
          formatStationScreen,
          (data) => data.trains.length > 0
        )
        await attempt('#车站', station, queryStation, formatStation, () => true)
      } else {
        record('#大屏 / #车站', '由真实车次结果派生', 'SKIP', '车次结果没有可用车站')
      }
    } else {
      record('#车次 / #车号 / #大屏 / #车站', '由真实车次结果派生', 'SKIP', '候选车次均未返回有效详情')
    }

    await findRoute()
    await attempt(
      '#铁路百科',
      'CR400AF',
      queryEncyclopedia,
      formatEncyclopedia,
      (data) => data.entries.length > 0
    )
    await attempt(
      '#铁路百科',
      '线路 宣杭铁路',
      queryEncyclopedia,
      formatEncyclopedia,
      (data) => data.entries.length > 0
    )
    try {
      const randomTrain = await queryRandomTrain()
      await recordFormatted('#随机列车', '', randomTrain, formatRandomTrain, true)
    } catch (error) {
      record('#随机列车', '', 'FAIL', errorText(error))
    }
    await attempt(
      '#机车信息',
      'HXD1D-1898',
      queryLocomotive,
      formatLocomotive,
      (data) => data.records.length > 0,
      { render: false, requireImagePart: true }
    )
  } catch (error) {
    record('#测试运行器', '内部执行', 'FAIL', errorText(error))
  } finally {
    if (chromeRenderer) {
      try {
        await chromeRenderer.close()
      } catch (error) {
        record('#截图运行时', 'Chrome Headless', 'FAIL-IMAGE', errorText(error))
      }
    }
  }

  let failures = results.filter((item) => item.status.startsWith('FAIL'))
  if (failures.length === 0) {
    try {
      await writeFile(path.join(imageStagingRoot, 'README.md'), imageReadmeMarkdown(), 'utf8')
      await replaceImageDirectory(imageStagingRoot)
      imageStagingRoot = null
    } catch (error) {
      record('#测试产物', 'images', 'FAIL-IMAGE', errorText(error))
    }
  }

  failures = results.filter((item) => item.status.startsWith('FAIL'))
  if (failures.length > 0 && imageStagingRoot && await fileExists(imageStagingRoot)) {
    for (const result of results) {
      if (result.images.length > 0) {
        result.images = []
        result.note += '；本轮存在失败，暂存 PNG 未替换正式产物'
      }
    }
    await removeArtifactDirectory(imageStagingRoot, '.images-staging-')
    imageStagingRoot = null
  }

  await writeFile(reportPath, reportMarkdown(startedAt), 'utf8')
  process.stdout.write(`命令测试完成：${results.length} 项，${failures.length} 项失败。报告：${reportPath}\n`)
  if (failures.length > 0) process.exitCode = 1
}

await main()
