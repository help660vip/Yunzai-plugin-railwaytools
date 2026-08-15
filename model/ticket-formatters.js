const DIVIDER = '------------------------------'

function exactModeLabel(mode) {
  if (mode === 'both') return '精确匹配发站和到站'
  if (mode === 'from') return '精确匹配发站'
  if (mode === 'to') return '精确匹配到站'
  return ''
}

function requestLines(request) {
  const timeRange = request.timeRange
    ? `出发时段：${request.timeRange.startHour}时至${request.timeRange.endHour}时`
    : ''
  return [
    `查询区间：${request.fromStation} → ${request.toStation}`,
    `乘车日期：${request.date}`,
    timeRange,
    exactModeLabel(request.exactMode)
  ].filter(Boolean)
}

function formatTrain(train, index) {
  const seats = train.seats.length > 0
    ? train.seats.map((seat) => `${seat.name}：${seat.value}`).join('\n')
    : '席别与票价：暂未返回'
  return [
    `【${index + 1}】${train.trainCode}（${train.originStation}——${train.terminalStation}）`,
    `${train.fromStation} ${train.departureTime} —— ${train.arrivalTime} ${train.toStation}，历时${train.duration}`,
    seats,
    DIVIDER
  ].join('\n')
}

export function formatTicketPage(data) {
  const trains = data.trains.map((train, index) => formatTrain(train, (data.page - 1) * 10 + index)).join('\n')
  return [
    data.scheduled ? '【定时车票查询结果】' : '【12306 车票查询】',
    ...requestLines(data.request),
    DIVIDER,
    trains || '未查询到符合条件的车次信息',
    `当前第 ${data.page} 页，共 ${data.totalPages} 页；共 ${data.totalResults} 趟列车`,
    data.hasNextPage ? '继续查看：发送 #下一页 或 next（5 分钟内有效）' : '',
    '数据来源：12306'
  ].filter(Boolean).join('\n')
}

export function formatScheduledWaiting(request, remainingRuns = 9) {
  return [
    '【定时车票查询】',
    ...requestLines(request),
    DIVIDER,
    '当前没有可售余票。',
    `${request.intervalLabel}后将再次查询，最多还将查询 ${remainingRuns} 次。`,
    '发送 #取消查询车票 可结束任务。',
    '数据来源：12306'
  ].join('\n')
}

export function formatScheduledFinished(request) {
  return [
    '【定时车票查询】',
    ...requestLines(request),
    DIVIDER,
    '当前仍没有可售余票，本次定时查询已结束。',
    '数据来源：12306'
  ].join('\n')
}
