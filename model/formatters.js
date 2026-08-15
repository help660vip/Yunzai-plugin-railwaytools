import { DATA_SOURCES } from './constants.js'
import { formatChineseDate } from './utils.js'

const DIVIDER = '------------------------------'

function formatDelay(delay, passed) {
  if (!Number.isFinite(delay)) return ''
  if (delay === 0) return passed ? '，正点运行' : '，预计正点'
  if (delay < 0) return `，提前${Math.abs(delay)}分`
  return `，晚点${delay}分`
}

export function formatEmuAssignments(data) {
  if (data.records.length === 0) return `未查询到 ${data.trainCode} 次列车的车组担当信息`
  const rows = data.records.map((record) => `${record.date}：${record.emuNumber}`).join('\n')
  return [
    `${data.trainCode} 次列车近 ${data.records.length} 次担当的车组号为：`,
    DIVIDER,
    rows,
    DIVIDER,
    `数据来源：${DATA_SOURCES.railRe}`
  ].join('\n')
}

export function formatTrainAssignments(data) {
  if (data.records.length === 0) return `未查询到车组号 ${data.emuNumber} 的担当车次`
  const rows = data.records.map((record) => `${record.date}：${record.trainCode}`).join('\n')
  return [
    `车组号 ${data.emuNumber} 近 ${data.records.length} 次担当的动车组车次为：`,
    DIVIDER,
    rows,
    DIVIDER,
    `数据来源：${DATA_SOURCES.railRe}`
  ].join('\n')
}

export function formatTrainDetails(data) {
  let previousTrainCode = data.rawTrainCode
  const stationRows = []

  data.stops.forEach((stop, index) => {
    const dayLabel = stop.dayDifference > 0 ? `（第${stop.dayDifference + 1}日）` : ''
    const delay = data.realtime
      ? formatDelay(stop.delay, data.realtime.currentIndex >= 0 && index <= data.realtime.currentIndex)
      : ''
    stationRows.push(
      `${index + 1}.${stop.station}${dayLabel}：${stop.arriveTime}到，${stop.startTime}开，停车${stop.stopover}${delay}`
    )
    if (stop.trainCode && stop.trainCode !== previousTrainCode) {
      stationRows.push(`【列车自当前车站起车次号变更为 ${stop.trainCode}】`)
      previousTrainCode = stop.trainCode
    }
  })

  const schedule = data.runsToday
    ? `${data.rawTrainCode} 次${formatChineseDate(data.serviceDate)}${data.startStation}方面正常开行`
    : `${data.rawTrainCode} 次今日不开行；以下为 ${formatChineseDate(data.serviceDate)} 的近期时刻信息`
  const realtime = data.realtimeRequested
    ? data.realtime?.text ?? '非今日开行数据不提供实时状态'
    : ''

  return [
    `车次：${data.trainCode}（${data.startStation}——${data.endStation}）`,
    `担当客运段：${data.corporation}`,
    `车型信息：${data.trainStyle}`,
    `配属：${data.allocation}`,
    schedule,
    realtime,
    '----------停站信息----------',
    stationRows.join('\n'),
    DIVIDER,
    `数据来源：${DATA_SOURCES.trainDetail}`
  ].filter(Boolean).join('\n')
}

export function formatStationScreen(data) {
  if (data.trains.length === 0) return `${data.stationName}站当前没有可显示的列车信息`
  const rows = data.trains.map((train, index) => [
    `${DIVIDER}\n【${index + 1}】${train.trainCode}（${train.startStation}——${train.endStation}）`,
    `发车时间：${train.departureTime}`,
    `候车室/检票口：${train.waitingRoom}`,
    `状态：${train.status}`
  ].join('\n')).join('\n')

  return [
    `【${data.stationName}站】车站大屏如下：`,
    rows,
    DIVIDER,
    '仅显示部分列车信息。数据来自第三方接口，仅供参考，请以车站公告和 12306 信息为准。'
  ].join('\n')
}

export function formatRoute(data) {
  const stations = data.stations.length > 0
    ? data.stations.map((station, index) => `【${index + 1}】${station.name}${station.mileage ? `  ${station.mileage}` : ''}`).join('\n')
    : '暂无沿途车站数据'

  return [
    `【${data.name}】线路信息：`,
    `线路类型：${data.railType}`,
    `单/复线：${data.lineType}`,
    `设计时速：${data.designSpeed}`,
    '',
    '----------沿途车站----------',
    stations,
    DIVIDER,
    '* 起点、终点和里程为营业用运价信息，可能与线路实际运行长度不同。',
    `数据来源：${DATA_SOURCES.cnrail}`
  ].join('\n')
}

export function formatStation(data) {
  const basic = [
    `【${data.name}】基础信息如下：`,
    data.telecode ? `电报码：${data.telecode}` : '',
    `所属单位：${data.operator}`,
    `位置：${data.location}`,
    data.passengerService == null ? '' : data.passengerService ? '本站办理客运业务' : '本站不办理客运业务'
  ].filter(Boolean)

  const routes = data.connections.length > 0
    ? data.connections.map((connection) => [
        DIVIDER,
        `【${connection.lineName}】`,
        `下站${connection.next.destination}：${connection.next.station}`,
        `上站${connection.previous.destination}：${connection.previous.station}`
      ].join('\n')).join('\n')
    : `${DIVIDER}\n暂无该车站线路数据`

  return [...basic, routes, DIVIDER, `数据来源：${DATA_SOURCES.cnrail}`].join('\n')
}
