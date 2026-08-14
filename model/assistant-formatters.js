import { DATA_SOURCES } from './constants.js'
import { HELP_TEXT } from './formatters.js'
import { formatChineseDate } from './utils.js'

const DIVIDER = '------------------------------'
const TYPE_LABELS = Object.freeze({
  train: '动车组与高铁车型',
  locomotive: '机车型号',
  line: '铁路线路',
  station: '车站资料'
})

function buildExtendedHelpText() {
  const lines = HELP_TEXT.split('\n')
  const insertionIndex = Math.max(0, lines.length - 3)
  lines.splice(insertionIndex, 0,
    '',
    '#实时 G123',
    '查询指定车次的实时运行状态',
    '',
    '#铁路百科 CR400AF',
    '搜索动车组、机车、线路和车站知识',
    '',
    '#随机列车',
    '随机查看一趟列车与铁路小知识'
  )
  return lines.join('\n')
}

export const ASSISTANT_HELP_TEXT = buildExtendedHelpText()

export function formatRealtimeStatus(data) {
  return [
    `【${data.rawTrainCode} 实时运行状态】`,
    `运行区间：${data.startStation}——${data.endStation}`,
    `开行日期：${formatChineseDate(data.serviceDate)}`,
    `当前状态：${data.status}`,
    data.currentStation ? `参考站点：${data.currentStation}` : '',
    data.nextStation ? `下一站：${data.nextStation}` : '',
    `正晚点：${data.delay}`,
    DIVIDER,
    '当前状态根据时刻与正晚点字段推算，仅供参考，请以铁路官方信息为准。',
    `数据来源：${DATA_SOURCES.trainDetail}`
  ].filter(Boolean).join('\n')
}

export function formatEncyclopedia(data) {
  if (data.entries.length === 0) return `铁路百科暂未收录“${data.keyword}”`
  if (data.entries.length > 1) {
    const matches = data.entries.map((entry, index) => (
      `【${index + 1}】${entry.name}（${entry.category || TYPE_LABELS[entry.type]}）\n${entry.summary}`
    )).join('\n\n')
    return [
      `【铁路百科】“${data.keyword}”相关条目`,
      DIVIDER,
      matches,
      DIVIDER,
      '可使用更完整的车型、机车型号、线路或车站名称继续查询。'
    ].join('\n')
  }

  const entry = data.entries[0]
  return [
    `【铁路百科】${entry.name}`,
    `分类：${entry.category || TYPE_LABELS[entry.type]}`,
    `条目标识：${entry.id}`,
    DIVIDER,
    entry.summary,
    ...entry.details.map((detail) => `· ${detail}`),
    entry.fact ? `${DIVIDER}\n铁路小知识：${entry.fact}` : '',
    `资料来源：${entry.source}`
  ].filter(Boolean).join('\n')
}

export function formatRandomTrain(data) {
  const details = data.details
  const stationPreview = details.stops.slice(0, 6).map((stop) => stop.station).join(' → ')
  return [
    '【随机列车】',
    `车次：${details.trainCode}`,
    `运行区间：${details.startStation}——${details.endStation}`,
    `开行日期：${formatChineseDate(details.serviceDate)}`,
    `车型信息：${details.trainStyle}`,
    `担当客运段：${details.corporation}`,
    `配属：${details.allocation}`,
    DIVIDER,
    `停站节选：${stationPreview}`,
    data.knowledge?.fact ? `铁路小知识：${data.knowledge.fact}` : '',
    DIVIDER,
    `数据来源：${DATA_SOURCES.trainDetail}、铁路百科`
  ].filter(Boolean).join('\n')
}
