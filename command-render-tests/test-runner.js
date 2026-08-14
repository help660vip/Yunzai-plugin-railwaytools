import { access, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import {
  formatEmuAssignments,
  formatLocomotive,
  formatRoute,
  formatStation,
  formatStationScreen,
  formatTrainAssignments,
  formatTrainDetails,
  HELP_TEXT
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
const imageReadmePath = path.join(imageRoot, 'README.md')
const reportPath = path.join(testRoot, 'report.md')
const trainCandidates = ['G895', 'G6005', 'C7213', 'D169', 'T222']
const routeCandidates = ['京沪高速铁路', '京沪高铁', '京广高速铁路']
const artifactPrefixes = Object.freeze({
  '#车迷帮助': 'help',
  '#车号': 'emu-number',
  '#车次': 'train-number',
  '#查询': 'train-query',
  '#大屏': 'station-screen',
  '#线路': 'route',
  '#车站': 'station',
  '#机车信息': 'locomotive'
})

const results = []
let screenshotRuntime = null
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
  if (result.status === 'PASS') return `${result.images.length} 张 Puppeteer 图片`
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

function safeFileName(value) {
  return value.replace(/[^a-z0-9-]+/giu, '-').replace(/^-+|-+$/gu, '').toLowerCase()
}

async function prepareImageDirectory() {
  await mkdir(imageRoot, { recursive: true })
  const entries = await readdir(imageRoot, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.png')) {
      await rm(path.join(imageRoot, entry.name), { force: true })
    }
  }
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
  if (!screenshotRuntime) return []

  const previousSegment = globalThis.segment
  globalThis.segment = { image: (buffer) => ({ buffer }) }
  try {
    const segments = await renderTextImage({ runtime: { puppeteer: screenshotRuntime } }, text)
    const prefix = artifactPrefixes[command] ?? 'result'
    const stem = safeFileName(`${prefix}-${parameter || 'default'}`)
    const files = []
    for (let index = 0; index < segments.length; index += 1) {
      const buffer = segments[index]?.buffer
      if (!Buffer.isBuffer(buffer)) throw new TypeError('渲染结果不是 Buffer 图片段')
      const fileName = `${stem}-${index + 1}.png`
      const dimensions = readPngDimensions(buffer)
      await writeFile(path.join(imageRoot, fileName), buffer)
      files.push({ file: `images/${fileName}`, ...dimensions })
    }
    return files
  } finally {
    globalThis.segment = previousSegment
  }
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
    if (screenshotRuntime) {
      record(command, parameter, 'PASS', `生成 ${images.length} 张真实截图`, images)
    } else {
      record(command, parameter, 'SKIP-IMAGE', '业务结果有效；当前环境无 TRSS Puppeteer，跳过截图')
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
          '字体/背景/GitHub=请查看真实 PNG'
        ].join('；')
      : result.command === '#机车信息'
        ? 'SKIP（按产品规则不使用 Puppeteer）'
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
    '- `PASS`：业务查询和预期输出方式均成功；若存在截图链接，文件由 TRSS-Yunzai 的共享 Puppeteer 实际生成。',
    '- `SKIP-IMAGE`：业务查询成功，但独立工作区没有 TRSS-Yunzai Puppeteer；图片数量、尺寸、分页、字体、背景与 GitHub 页脚均未假定通过。',
    '- `EMPTY`：真实接口没有返回有效记录，保持普通文字空结果。',
    '- `FAIL` / `FAIL-IMAGE`：真实接口或截图运行失败，错误已如实记录。',
    '- `#机车信息` 按产品规则保留实拍图消息段与普通文字，不进行 Puppeteer 渲染，文字中不得包含 URL。',
    ''
  ].join('\n')
}

function imageReadmeMarkdown() {
  const images = results.flatMap((result) => result.images)
  const state = screenshotRuntime
    ? images.length > 0
      ? `本次通过 TRSS-Yunzai 共享 Puppeteer 生成 ${images.length} 个真实 PNG。`
      : '本次已加载 TRSS-Yunzai 共享 Puppeteer，但没有成功生成 PNG；请查看测试报告。'
    : '当前环境未检测到 TRSS-Yunzai 共享 Puppeteer，未生成 PNG；报告中的截图验收明确标记为 SKIP。'
  return [
    '# 渲染测试图片',
    '',
    state,
    '',
    '本目录不保存占位图。测试运行器只清理此前生成的 PNG，并保留或重建本说明文件。',
    ...(images.length > 0
      ? ['', ...images.map((image) => `- [${image.file}](${path.basename(image.file)})：${image.width}×${image.height}`)]
      : []),
    ''
  ].join('\n')
}

async function main() {
  const startedAt = new Date().toISOString()
  await prepareImageDirectory()
  screenshotRuntime = await loadTrssPuppeteer()

  await recordFormatted('#车迷帮助', '', HELP_TEXT, (text) => text, true)

  const details = await findTrainDetails()
  if (details) {
    await recordFormatted('#车次', details.rawTrainCode, details, formatTrainDetails, details.stops.length > 0)

    const emu = await findEmuAssignments()
    const emuNumber = emu?.records?.find((item) => item.emuNumber)?.emuNumber
    if (emuNumber) {
      await attempt(
        '#车次',
        emuNumber,
        queryTrainAssignments,
        formatTrainAssignments,
        (data) => data.records.length > 0
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
    '#机车信息',
    'HXD1D-1898',
    queryLocomotive,
    formatLocomotive,
    (data) => data.records.length > 0,
    { render: false, requireImagePart: true }
  )

  await writeFile(imageReadmePath, imageReadmeMarkdown(), 'utf8')
  await writeFile(reportPath, reportMarkdown(startedAt), 'utf8')
  const failures = results.filter((item) => item.status.startsWith('FAIL'))
  process.stdout.write(`命令测试完成：${results.length} 项，${failures.length} 项失败。报告：${reportPath}\n`)
  if (failures.length > 0) process.exitCode = 1
}

await main()
