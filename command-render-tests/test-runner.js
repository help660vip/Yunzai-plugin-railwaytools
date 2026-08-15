import { access, mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createChromeRenderer } from './chrome-renderer.js'
import { formatRealtimeStatus } from '../model/assistant-formatters.js'
import { queryRealtimeStatus } from '../model/assistant-services.js'
import {
  formatEmuAssignments,
  formatRoute,
  formatStation,
  formatStationScreen,
  formatTrainAssignments,
  formatTrainDetails
} from '../model/formatters.js'
import { MAIN_HELP_MENU, TICKET_HELP_MENU } from '../model/help-menu.js'
import { buildMenuHtml } from '../model/render-menu-image.js'
import { createBackgroundUrl } from '../model/render-text-image.js'
import {
  queryEmuAssignments,
  queryRoute,
  queryStation,
  queryStationScreen,
  queryTrainAssignments,
  queryTrainDetails
} from '../model/services.js'
import { formatScheduledWaiting, formatTicketPage } from '../model/ticket-formatters.js'
import { buildTicketPage, getAvailableTicketResult, queryTickets } from '../model/ticket-service.js'
import { getShanghaiDate } from '../model/utils.js'

const root = path.dirname(fileURLToPath(import.meta.url))
const imageRoot = path.join(root, 'images')
const reportPath = path.join(root, 'report.md')
const candidates = ['G2755', 'G2717', 'G6005', 'C7213', 'D169', 'T222']
const artifactPrefixes = Object.freeze({
  '#车迷帮助': 'main-help',
  '#车票帮助': 'ticket-help',
  '#车次': 'train-number',
  '#车号': 'emu-number',
  '#查询': 'train-query',
  '#实时': 'realtime',
  '#大屏': 'station-screen',
  '#线路': 'route',
  '#车站': 'station',
  '#查询车票': 'ticket-query',
  '#下一页': 'ticket-next-page',
  '#定时查询车票': 'ticket-scheduled',
  '#取消查询车票': 'ticket-cancel'
})
const artifactParameters = Object.freeze({
  上海: 'shanghai',
  京沪高铁: 'jinghu-hsr',
  '北京南-上海虹桥': 'beijingnan-shanghaihongqiao',
  '北京南-上海虹桥-第2页': 'beijingnan-shanghaihongqiao-page2'
})
const results = []
let renderer
let staging

function errorText(error) {
  return String(error?.message ?? error).replaceAll('|', '\\|').replaceAll('\n', ' ')
}

async function exists(target) {
  try { await access(target); return true } catch { return false }
}

function safeArtifactDirectory(target, prefix) {
  const resolved = path.resolve(target)
  const relative = path.relative(path.resolve(root), resolved)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || !path.basename(resolved).startsWith(prefix)) {
    throw new Error('Refusing to modify an unsafe screenshot directory')
  }
  return resolved
}

function pngDimensions(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 24 || buffer.readUInt32BE(0) !== 0x89504e47) {
    throw new TypeError('Screenshot is not a valid PNG')
  }
  const width = buffer.readUInt32BE(16)
  const height = buffer.readUInt32BE(20)
  if (width < 360 || width > 720 || height <= 0 || height > 4000) {
    throw new RangeError(`Screenshot dimensions are outside limits: ${width}x${height}`)
  }
  return { width, height }
}

function slug(value) {
  return String(value).toLocaleLowerCase('en-US').replace(/[^a-z0-9\u4e00-\u9fff-]+/gu, '-').replace(/^-+|-+$/gu, '')
}

async function store(command, parameter, buffers) {
  const safeParameter = artifactParameters[parameter] ?? (parameter || 'default')
  const stem = slug(`${artifactPrefixes[command] ?? 'result'}-${safeParameter}`)
  const images = []
  for (let index = 0; index < buffers.length; index += 1) {
    const file = `${stem}-${index + 1}.png`
    const dimensions = pngDimensions(buffers[index])
    await writeFile(path.join(staging, file), buffers[index])
    images.push({ file: `images/${file}`, ...dimensions })
  }
  return images
}

async function recordText(command, parameter, text, artifactParameter = parameter) {
  try {
    const images = await store(command, artifactParameter, await renderer.render(text))
    results.push({ command, parameter, status: 'PASS', note: '真实接口与 Chrome Headless 截图通过', images })
  } catch (error) {
    results.push({ command, parameter, status: 'FAIL', note: errorText(error), images: [] })
  }
}

async function recordMenu(command, menu) {
  try {
    const menuOptions = { minWidth: 360, maxWidth: 640, backgroundUrl: createBackgroundUrl() }
    const html = buildMenuHtml(menu, menuOptions)
    const images = await store(command, '', await renderer.renderHtml(html, menuOptions))
    results.push({ command, parameter: '', status: 'PASS', note: '结构化帮助菜单真实截图通过', images })
  } catch (error) {
    results.push({ command, parameter: '', status: 'FAIL', note: errorText(error), images: [] })
  }
}

async function recordQuery(command, parameter, query, formatter) {
  try {
    const data = await query(parameter)
    await recordText(command, parameter, formatter(data))
    return data
  } catch (error) {
    results.push({ command, parameter, status: 'FAIL', note: errorText(error), images: [] })
    return null
  }
}

async function firstWorkingTrain() {
  for (const code of candidates) {
    try {
      const details = await queryTrainDetails(code)
      if (details.stops.length > 0) return details
    } catch {
      // Continue through the documented candidates until a running train is found.
    }
  }
  throw new Error('No train-detail candidate returned a usable result')
}

async function runCommands() {
  await recordMenu('#车迷帮助', MAIN_HELP_MENU)
  await recordMenu('#车票帮助', TICKET_HELP_MENU)

  const details = await firstWorkingTrain()
  const queryCode = details.queryCode || details.rawTrainCode
  await recordText('#车次', queryCode, formatTrainDetails(details))
  await recordText('#查询', queryCode, formatTrainDetails(details))
  await recordQuery('#实时', queryCode, queryRealtimeStatus, formatRealtimeStatus)

  const emu = await recordQuery('#车号', queryCode, queryEmuAssignments, formatEmuAssignments)
  const emuNumber = emu?.records?.[0]?.emuNumber
  if (emuNumber) {
    try {
      const assignments = await queryTrainAssignments(emuNumber)
      await recordText('#车次', emuNumber, formatTrainAssignments(assignments), 'emu-reverse')
    } catch (error) {
      results.push({ command: '#车次', parameter: emuNumber, status: 'FAIL', note: errorText(error), images: [] })
    }
  }
  else results.push({ command: '#车次', parameter: '动车组号反查', status: 'SKIP', note: '本次车号接口没有返回可派生的动车组号', images: [] })

  await recordQuery('#大屏', '上海', queryStationScreen, formatStationScreen)
  await recordQuery('#线路', '京沪高铁', queryRoute, formatRoute)
  await recordQuery('#车站', '上海', queryStation, formatStation)

  try {
    const request = {
      fromStation: '北京南',
      toStation: '上海虹桥',
      date: getShanghaiDate(1),
      exactMode: 'none',
      timeRange: null
    }
    const tickets = await queryTickets(request)
    if (tickets.records.length === 0) throw new Error('12306 returned no ticket records')
    const firstPage = await buildTicketPage(tickets, 1)
    await recordText('#查询车票', '北京南-上海虹桥', formatTicketPage(firstPage))
    if (firstPage.hasNextPage) {
      await recordText('#下一页', '北京南-上海虹桥-第2页', formatTicketPage(await buildTicketPage(tickets, 2)))
    } else {
      results.push({ command: '#下一页', parameter: '', status: 'SKIP', note: '真实结果只有一页', images: [] })
    }

    const scheduledRequest = { ...request, intervalMinutes: 10, intervalLabel: '10分钟' }
    const available = getAvailableTicketResult({ ...tickets, request: scheduledRequest })
    const scheduledText = available.records.length > 0
      ? formatTicketPage(await buildTicketPage(available, 1, { scheduled: true }))
      : formatScheduledWaiting(scheduledRequest, 9)
    await recordText('#定时查询车票', '北京南-上海虹桥', scheduledText)
  } catch (error) {
    for (const command of ['#查询车票', '#下一页', '#定时查询车票']) {
      results.push({ command, parameter: '', status: 'FAIL', note: errorText(error), images: [] })
    }
  }

  await recordText('#取消查询车票', '', '当前没有正在进行的定时车票查询任务')
}

async function writeReport(rendererNote) {
  const rows = results.map((result) => {
    const images = result.images.length
      ? result.images.map((image) => `[${image.width}x${image.height}](${image.file})`).join('<br>')
      : '—'
    return `| ${result.command} | ${result.parameter || '—'} | ${result.status} | ${result.note} | ${images} |`
  })
  const passed = results.filter((result) => result.status === 'PASS').length
  const failed = results.filter((result) => result.status === 'FAIL').length
  const skipped = results.filter((result) => result.status === 'SKIP').length
  await writeFile(reportPath, [
    '# 命令与图片验证报告',
    '',
    `- 执行时间：${new Date().toISOString()}`,
    `- 截图方式：${rendererNote}`,
    `- 结果：${passed} 通过，${failed} 失败，${skipped} 跳过`,
    '- 图片来自真实接口结果；未生成占位图。',
    '',
    '| 命令 | 参数 | 状态 | 说明 | PNG |',
    '| --- | --- | --- | --- | --- |',
    ...rows,
    ''
  ].join('\n'), 'utf8')
}

async function replaceImages() {
  const backup = safeArtifactDirectory(path.join(root, `.images-backup-${process.pid}-${Date.now()}`), '.images-backup-')
  const hadImages = await exists(imageRoot)
  if (hadImages) await rename(imageRoot, backup)
  try {
    await rename(staging, imageRoot)
  } catch (error) {
    if (hadImages && await exists(backup)) await rename(backup, imageRoot)
    throw error
  }
  if (hadImages) await rm(backup, { recursive: true, force: true })
  await writeFile(path.join(imageRoot, 'README.md'), [
    '# 图片产物',
    '',
    '本目录由 `npm run test:render` 使用真实接口数据和 Chrome Headless 生成。',
    '文件用于 README 展示与人工复核，不包含占位图片。',
    ''
  ].join('\n'), 'utf8')
}

async function main() {
  staging = safeArtifactDirectory(await mkdtemp(path.join(root, '.images-staging-')), '.images-staging-')
  let note = ''
  try {
    const initialized = await createChromeRenderer()
    renderer = initialized.renderer
    note = initialized.note
    if (!renderer) throw new Error(note)
    await runCommands()
    const failures = results.filter((result) => result.status === 'FAIL')
    await writeReport(note)
    if (failures.length > 0) throw new Error(`${failures.length} command checks failed`)
    await replaceImages()
    staging = null
  } finally {
    await renderer?.close?.()
    if (staging && await exists(staging)) await rm(staging, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
