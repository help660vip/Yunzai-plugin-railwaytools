import { DATA_SOURCES } from './constants.js'
import { formatChineseDate } from './utils.js'

const DIVIDER = '------------------------------'

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
