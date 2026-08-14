export class RealtimeProviderError extends Error {
  constructor(message, code = 'REALTIME_PROVIDER_ERROR', options = {}) {
    super(message, options)
    this.name = 'RealtimeProviderError'
    this.code = code
  }
}

export class RealtimeProviderRegistry {
  constructor(providers = []) {
    this.providers = []
    for (const provider of providers) this.register(provider)
  }

  register(provider) {
    if (!provider || typeof provider.query !== 'function') {
      throw new TypeError('Realtime provider must implement query(trainCode)')
    }
    this.providers.push(provider)
    return this
  }

  async query(trainCode) {
    let lastUnavailableError = null
    for (const provider of this.providers) {
      if (typeof provider.supports === 'function' && !provider.supports(trainCode)) continue
      try {
        return await provider.query(trainCode)
      } catch (error) {
        if (error?.code !== 'PROVIDER_UNAVAILABLE') throw error
        lastUnavailableError = error
      }
    }

    throw lastUnavailableError ?? new RealtimeProviderError(
      '当前没有可用的列车实时状态数据源',
      'PROVIDER_UNAVAILABLE'
    )
  }
}

function formatDelay(delay) {
  if (!Number.isFinite(delay)) return '暂无正晚点数据'
  if (delay === 0) return '正点'
  if (delay < 0) return `提前${Math.abs(delay)}分`
  return `晚点${delay}分`
}

export function createTimetableRealtimeProvider(loadTrainDetails) {
  if (typeof loadTrainDetails !== 'function') {
    throw new TypeError('Timetable realtime provider requires a train detail loader')
  }

  return Object.freeze({
    id: 'timetable-estimate',
    name: '12306 时刻与正晚点推算',
    estimated: true,
    supports: (trainCode) => Boolean(trainCode),
    async query(trainCode) {
      const details = await loadTrainDetails(`${trainCode} -实时`)
      const currentIndex = Number(details.realtime?.currentIndex)
      const hasCurrentIndex = Number.isInteger(currentIndex) && currentIndex >= 0
      const currentStop = hasCurrentIndex ? details.stops[currentIndex] : null
      const nextStop = hasCurrentIndex ? details.stops[currentIndex + 1] : null

      return {
        providerId: this.id,
        providerName: this.name,
        estimated: this.estimated,
        trainCode: details.trainCode,
        rawTrainCode: details.rawTrainCode,
        startStation: details.startStation,
        endStation: details.endStation,
        serviceDate: details.serviceDate,
        runsToday: details.runsToday,
        status: details.realtime?.text ?? '今日暂无可用的实时运行状态',
        currentStation: currentStop?.station ?? '',
        nextStation: nextStop?.station ?? '',
        delay: formatDelay(currentStop?.delay),
        details
      }
    }
  })
}
