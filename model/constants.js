export const API_ENDPOINTS = Object.freeze({
  trainDetail: 'https://mobile.12306.cn/wxxcx/wechat/main/travelServiceQrcodeTrainInfo',
  railRe: 'https://api.rail.re',
  stationScreen: 'https://www.12036.com:8095/station',
  cnrail: 'http://cnrail.geogv.org/api',
  ticketStations: 'https://kyfw.12306.cn/otn/resources/js/framework/station_name.js',
  ticketInit: 'https://kyfw.12306.cn/otn/leftTicket/init',
  ticketPrice: 'https://kyfw.12306.cn/otn/leftTicket/queryTicketPrice'
})

export const HTTP_TIMEOUT_MS = 15_000
export const MAX_LIST_ITEMS = 10
export const MAX_ASSIGNMENT_ITEMS = 8
export const DATA_SOURCES = Object.freeze({
  railRe: 'rail.re',
  trainDetail: '12306',
  stationScreen: '第三方车站大屏接口',
  cnrail: 'cnrail.geogv.org',
  ticket: '12306'
})
