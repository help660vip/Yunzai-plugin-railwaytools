import plugin from '../../../lib/plugins/plugin.js'

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
import {
  getPublicErrorMessage,
  queryEmuAssignments,
  queryLocomotive,
  queryRoute,
  queryStation,
  queryStationScreen,
  queryTrainAssignments,
  queryTrainDetails
} from '../model/services.js'
import { renderTextImage } from '../model/render-text-image.js'
import { extractCommandArgument, looksLikeTrainCode } from '../model/utils.js'

const WS = '[\\s\\u200B-\\u200D\\u2060\\uFEFF]'
const aliasPattern = (alias) => [...alias].map((character) => {
  if (!/[a-z]/iu.test(character)) return character
  const lower = character.toLowerCase()
  const upper = character.toUpperCase()
  const fullwidthLower = String.fromCharCode(lower.charCodeAt(0) + 0xfee0)
  const fullwidthUpper = String.fromCharCode(upper.charCodeAt(0) + 0xfee0)
  return `[${lower}${upper}${fullwidthLower}${fullwidthUpper}]`
}).join('')

const commandRule = (aliases) => {
  const names = aliases.map(aliasPattern).join('|')
  return `^${WS}*[#＃]${WS}*(?:${names})(?:${WS}+[\\s\\S]*)?${WS}*$`
}

const COMMANDS = Object.freeze({
  help: ['车迷帮助'],
  emuNumber: ['车号', 'ch', '查车号'],
  trainNumber: ['车次', 'cc', '查车次'],
  trainInfo: ['列车查询', 'cx', '查询'],
  stationScreen: ['车站大屏', 'dp', '大屏'],
  route: ['线路信息', 'xl', '线路', '铁路', '线'],
  station: ['车站信息', 'cz', '车站', '站'],
  locomotive: ['机车信息', 'jcxx']
})

export class RailwayTools extends plugin {
  constructor() {
    super({
      name: '铁路工具箱',
      dsc: '列车、车组、车站、线路与机车信息查询',
      event: 'message',
      priority: 5000,
      rule: [
        { reg: commandRule(COMMANDS.help), fnc: 'showHelp' },
        { reg: commandRule(COMMANDS.emuNumber), fnc: 'handleEmuNumber' },
        { reg: commandRule(COMMANDS.trainNumber), fnc: 'handleTrainNumber' },
        { reg: commandRule(COMMANDS.trainInfo), fnc: 'handleTrainInfo' },
        { reg: commandRule(COMMANDS.stationScreen), fnc: 'handleStationScreen' },
        { reg: commandRule(COMMANDS.route), fnc: 'handleRoute' },
        { reg: commandRule(COMMANDS.station), fnc: 'handleStation' },
        { reg: commandRule(COMMANDS.locomotive), fnc: 'handleLocomotive' }
      ]
    })
  }

  async showHelp() {
    await this.replyRenderedText(HELP_TEXT)
    return true
  }

  getArgument(aliases) {
    return extractCommandArgument(this.e?.msg, aliases)
  }

  async execute(aliases, prompt, query, formatter, options = {}) {
    const argument = this.getArgument(aliases)
    if (!argument) {
      await this.reply(prompt)
      return true
    }

    try {
      const result = await query(argument)
      const formatted = formatter(result)
      const shouldRender = options.render !== false && options.shouldRender?.(result) === true
      if (shouldRender && typeof formatted === 'string') {
        await this.replyRenderedText(formatted)
      } else {
        await this.reply(this.toYunzaiMessage(formatted))
      }
    } catch (error) {
      this.logError(error)
      await this.reply(getPublicErrorMessage(error))
    }
    return true
  }

  async replyRenderedText(text) {
    try {
      const images = await renderTextImage(this.e, text)
      await this.reply(images)
    } catch (error) {
      this.logError(error)
      await this.reply(text)
    }
  }

  toYunzaiMessage(message) {
    if (!Array.isArray(message)) return message
    return message.map((part) => {
      if (typeof part === 'string') return part
      if (part?.type !== 'image' || !part.url) return ''
      const image = globalThis.segment?.image
      return typeof image === 'function' ? image(part.url) : ''
    }).filter(Boolean)
  }

  logError(error) {
    const log = globalThis.logger?.error ?? console.error
    log.call(globalThis.logger ?? console, `[Yunzai-plugin-railwaytools] ${error?.stack ?? error}`)
  }

  async handleEmuNumber() {
    return this.execute(
      COMMANDS.emuNumber,
      '请输入动车组车次，例如：#车号 G123',
      queryEmuAssignments,
      formatEmuAssignments,
      { shouldRender: (result) => result.records.length > 0 }
    )
  }

  async handleTrainNumber() {
    const argument = this.getArgument(COMMANDS.trainNumber)
    if (!argument) {
      await this.reply('请输入车次或动车组号，例如：#车次 G123')
      return true
    }

    if (looksLikeTrainCode(argument)) {
      return this.execute(
        COMMANDS.trainNumber,
        '',
        queryTrainDetails,
        formatTrainDetails,
        { shouldRender: (result) => result.stops.length > 0 }
      )
    }
    return this.execute(
      COMMANDS.trainNumber,
      '',
      queryTrainAssignments,
      formatTrainAssignments,
      { shouldRender: (result) => result.records.length > 0 }
    )
  }

  async handleTrainInfo() {
    return this.execute(
      COMMANDS.trainInfo,
      '请输入列车车次，例如：#查询 G123',
      queryTrainDetails,
      formatTrainDetails,
      { shouldRender: (result) => result.stops.length > 0 }
    )
  }

  async handleStationScreen() {
    return this.execute(
      COMMANDS.stationScreen,
      '请输入车站名称，例如：#大屏 上海',
      queryStationScreen,
      formatStationScreen,
      { shouldRender: (result) => result.trains.length > 0 }
    )
  }

  async handleRoute() {
    return this.execute(
      COMMANDS.route,
      '请输入线路名称，例如：#线路 京沪高铁',
      queryRoute,
      formatRoute,
      { shouldRender: () => true }
    )
  }

  async handleStation() {
    return this.execute(
      COMMANDS.station,
      '请输入车站名称，例如：#车站 上海',
      queryStation,
      formatStation,
      { shouldRender: () => true }
    )
  }

  async handleLocomotive() {
    return this.execute(
      COMMANDS.locomotive,
      '请输入机车或动车组车号，例如：#机车信息 HXD1D-1898',
      queryLocomotive,
      formatLocomotive,
      { render: false }
    )
  }
}
