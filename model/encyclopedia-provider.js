import { DATA_SOURCES } from './constants.js'

function isNotFound(error) {
  return error?.code === 'NOT_FOUND'
}

function freezeEntry(entry) {
  return Object.freeze({
    ...entry,
    aliases: Object.freeze(entry.aliases ?? []),
    details: Object.freeze(entry.details ?? [])
  })
}

function toLineEntry(data, keyword) {
  const details = [
    data.railType ? `线路类型：${data.railType}` : '',
    data.lineType ? `单复线：${data.lineType}` : '',
    data.designSpeed ? `设计时速：${data.designSpeed}` : '',
    `当前数据源返回沿途车站 ${data.stations.length} 座。`
  ].filter(Boolean)

  return freezeEntry({
    id: data.name,
    name: data.name,
    type: 'line',
    category: '铁路线路（动态资料）',
    aliases: keyword === data.name ? [] : [keyword],
    summary: `${data.name}的线路基础资料由现有铁路线路数据源实时补全。`,
    details,
    fact: data.stations.length > 1
      ? `数据中的首末车站为${data.stations[0].name}和${data.stations.at(-1).name}。`
      : '',
    source: `${DATA_SOURCES.cnrail}（动态查询）`
  })
}

function toStationEntry(data, keyword) {
  const details = [
    data.type ? `车站类型：${data.type}` : '',
    data.telecode ? `电报码：${data.telecode}` : '',
    data.operator ? `所属单位：${data.operator}` : '',
    data.location ? `位置：${data.location}` : '',
    `当前数据源返回关联线路 ${data.connections.length} 条。`
  ].filter(Boolean)

  return freezeEntry({
    id: data.name,
    name: data.name,
    type: 'station',
    category: '车站资料（动态资料）',
    aliases: keyword === data.name ? [] : [keyword],
    summary: `${data.name}的车站基础资料由现有铁路车站数据源实时补全。`,
    details,
    source: `${DATA_SOURCES.cnrail}（动态查询）`
  })
}

function getCandidateTypes(type, keyword) {
  if (type === 'line' || type === 'station') return [type]
  if (/(?:铁路|高铁|客专|城际|线)$/u.test(keyword)) return ['line', 'station']
  return ['station', 'line']
}

export class EncyclopediaProviderRegistry {
  constructor(providers = []) {
    this.providers = [...providers]
  }

  register(provider) {
    if (!provider || typeof provider.query !== 'function') {
      throw new TypeError('Encyclopedia provider must implement query()')
    }
    this.providers.push(provider)
    return this
  }

  async query(context) {
    let lastError = null
    for (const provider of this.providers) {
      if (typeof provider.supports === 'function' && !provider.supports(context)) continue
      try {
        const entries = await provider.query(context)
        if (Array.isArray(entries) && entries.length > 0) return entries
      } catch (error) {
        if (!isNotFound(error)) lastError = error
      }
    }
    if (lastError) throw lastError
    return []
  }
}

export function createRailwayNetworkEncyclopediaProvider({ queryRoute, queryStation }) {
  if (typeof queryRoute !== 'function' || typeof queryStation !== 'function') {
    throw new TypeError('Railway encyclopedia provider requires route and station queries')
  }

  return Object.freeze({
    id: 'railway-network',
    supports: ({ type }) => !type || type === 'line' || type === 'station',
    async query({ type, keyword }) {
      let lastError = null
      for (const candidateType of getCandidateTypes(type, keyword)) {
        try {
          if (candidateType === 'line') return [toLineEntry(await queryRoute(keyword), keyword)]
          return [toStationEntry(await queryStation(keyword), keyword)]
        } catch (error) {
          if (!isNotFound(error)) lastError = error
        }
      }
      if (lastError) throw lastError
      return []
    }
  })
}
