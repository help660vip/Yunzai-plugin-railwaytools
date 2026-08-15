import plugin from '../../../lib/plugins/plugin.js'

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
import { MAIN_HELP_MENU, menuToText, TICKET_HELP_MENU } from '../model/help-menu.js'
import { renderMenuImage } from '../model/render-menu-image.js'
import {
  getPublicErrorMessage,
  queryEmuAssignments,
  queryRoute,
  queryStation,
  queryStationScreen,
  queryTrainAssignments,
  queryTrainDetails
} from '../model/services.js'
import {
  formatScheduledFinished,
  formatScheduledWaiting,
  formatTicketPage
} from '../model/ticket-formatters.js'
import {
  getTicketSessionKey,
  parseScheduledTicketInput,
  parseTicketQueryInput
} from '../model/ticket-parser.js'
import {
  buildTicketPage,
  getAvailableTicketResult,
  queryTickets
} from '../model/ticket-service.js'
import { scheduledTicketTasks, ticketPagination } from '../model/ticket-sessions.js'
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

const nextPageRule = `^${WS}*(?:(?:[#＃]${WS}*(?:下一页|${aliasPattern('next')}))|${aliasPattern('next')})${WS}*$`

const COMMANDS = Object.freeze({
  help: ['车迷帮助'],
  ticketHelp: ['车票帮助'],
  ticket: ['查询车票'],
  scheduledTicket: ['定时查询车票'],
  cancelTicket: ['取消查询车票'],
  emuNumber: ['车号', 'ch', '查车号'],
  trainNumber: ['车次', 'cc', '查车次'],
  trainInfo: ['列车查询', 'cx', '查询'],
  realtime: ['实时状态', '实时运行', '实时', 'ss'],
  stationScreen: ['车站大屏', 'dp', '大屏'],
  route: ['线路信息', 'xl', '线路', '铁路', '线'],
  station: ['车站信息', 'cz', '车站', '站']
})

export class RailwayTools extends plugin {
  constructor() {
    super({
      name: '铁路工具箱',
      dsc: '列车、车组、车站、线路、运行状态与 12306 车票查询',
      event: 'message',
      priority: 5000,
      rule: [
        { reg: commandRule(COMMANDS.help), fnc: 'showHelp' },
        { reg: commandRule(COMMANDS.ticketHelp), fnc: 'showTicketHelp' },
        { reg: commandRule(COMMANDS.cancelTicket), fnc: 'handleCancelTicket' },
        { reg: commandRule(COMMANDS.scheduledTicket), fnc: 'handleScheduledTicket' },
        { reg: commandRule(COMMANDS.ticket), fnc: 'handleTicket' },
        { reg: nextPageRule, fnc: 'handleNextTicketPage' },
        { reg: commandRule(COMMANDS.emuNumber), fnc: 'handleEmuNumber' },
        { reg: commandRule(COMMANDS.trainNumber), fnc: 'handleTrainNumber' },
        { reg: commandRule(COMMANDS.trainInfo), fnc: 'handleTrainInfo' },
        { reg: commandRule(COMMANDS.realtime), fnc: 'handleRealtime' },
        { reg: commandRule(COMMANDS.stationScreen), fnc: 'handleStationScreen' },
        { reg: commandRule(COMMANDS.route), fnc: 'handleRoute' },
        { reg: commandRule(COMMANDS.station), fnc: 'handleStation' }
      ]
    })
  }

  async showHelp() {
    await this.replyRenderedMenu(MAIN_HELP_MENU)
    return true
  }

  async showTicketHelp() {
    await this.replyRenderedMenu(TICKET_HELP_MENU)
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
    return this.replyQuery(() => query(argument), formatter, options)
  }

  async replyQuery(query, formatter, options = {}) {
    try {
      const result = await query()
      const formatted = formatter(result)
      const shouldRender = options.render !== false && options.shouldRender?.(result) === true
      if (shouldRender && typeof formatted === 'string') await this.replyRenderedText(formatted)
      else await this.reply(formatted)
    } catch (error) {
      this.logError(error)
      await this.reply(getPublicErrorMessage(error))
    }
    return true
  }

  async replyRenderedText(text) {
    try {
      await this.reply(await renderTextImage(this.e, text))
    } catch (error) {
      this.logError(error)
      await this.reply(text)
    }
  }

  async replyRenderedMenu(menu) {
    try {
      await this.reply(await renderMenuImage(this.e, menu))
    } catch (error) {
      this.logError(error)
      await this.reply(menuToText(menu))
    }
  }

  createTicketNotifier() {
    const event = this.e
    const directReply = typeof event?.reply === 'function' ? event.reply.bind(event) : null
    return async (text, { render = true } = {}) => {
      let message = text
      if (render) {
        try {
          message = await renderTextImage({ runtime: event?.runtime }, text)
        } catch (error) {
          this.logError(error)
        }
      }
      const bot = globalThis.Bot
      const groupId = event?.group_id ?? event?.groupId
      const userId = event?.user_id ?? event?.userId
      const at = groupId != null && userId != null && typeof globalThis.segment?.at === 'function'
        ? globalThis.segment.at(userId)
        : null
      const outbound = at ? [at, ...(Array.isArray(message) ? message : [message])] : message
      if (directReply) {
        try {
          return await directReply(outbound)
        } catch (error) {
          this.logError(error)
        }
      }
      if (groupId != null && typeof bot?.pickGroup === 'function') {
        return bot.pickGroup(groupId).sendMsg(outbound)
      }
      if (userId != null && typeof bot?.pickFriend === 'function') {
        return bot.pickFriend(userId).sendMsg(message)
      }
      throw new Error('Unable to deliver scheduled ticket query result')
    }
  }

  logError(error) {
    const log = globalThis.logger?.error ?? console.error
    log.call(globalThis.logger ?? console, `[Yunzai-plugin-railwaytools] ${error?.stack ?? error}`)
  }

  async handleTicket() {
    const argument = this.getArgument(COMMANDS.ticket)
    if (!argument) {
      await this.reply('请输入出发站、到达站和可选日期，例如：#查询车票 北京南 上海虹桥 明天')
      return true
    }

    const key = getTicketSessionKey(this.e)
    ticketPagination.delete(key)
    try {
      const result = await queryTickets(parseTicketQueryInput(argument))
      if (result.records.length === 0) {
        await this.reply('未查询到符合条件的车次信息')
        return true
      }
      const page = await buildTicketPage(result, 1)
      await this.replyRenderedText(formatTicketPage(page))
      if (page.hasNextPage) ticketPagination.save(key, result)
    } catch (error) {
      this.logError(error)
      await this.reply(getPublicErrorMessage(error))
    }
    return true
  }

  async handleNextTicketPage() {
    const key = getTicketSessionKey(this.e)
    const session = ticketPagination.peek(key)
    if (!session) {
      await this.reply('当前没有可继续查看的车票结果，请先发送 #查询车票')
      return true
    }
    try {
      const page = await buildTicketPage(session.result, session.nextPage)
      await this.replyRenderedText(formatTicketPage(page))
      ticketPagination.advance(key, page.hasNextPage)
    } catch (error) {
      this.logError(error)
      await this.reply(getPublicErrorMessage(error))
    }
    return true
  }

  async handleScheduledTicket() {
    const argument = this.getArgument(COMMANDS.scheduledTicket)
    if (!argument) {
      await this.reply('请输入出发站、到达站、可选日期/时段和查询间隔；发送 #车票帮助 查看示例')
      return true
    }

    const key = getTicketSessionKey(this.e)
    scheduledTicketTasks.cancel(key)
    try {
      const request = parseScheduledTicketInput(argument)
      const result = await queryTickets(request)
      if (result.records.length === 0) {
        await this.reply('未查询到符合条件的车次信息')
        return true
      }
      const available = getAvailableTicketResult(result)
      if (available.records.length > 0) {
        const page = await buildTicketPage(available, 1, { scheduled: true })
        await this.replyRenderedText(formatTicketPage(page))
        if (page.hasNextPage) ticketPagination.save(key, available)
        return true
      }

      const notify = this.createTicketNotifier()
      scheduledTicketTasks.start(key, {
        intervalMs: request.intervalMinutes * 60_000,
        run: async (count, maximum) => {
          const refreshed = await queryTickets(request)
          const found = getAvailableTicketResult(refreshed)
          if (found.records.length > 0) {
            const page = await buildTicketPage(found, 1, { scheduled: true })
            await notify(formatTicketPage(page))
            if (page.hasNextPage) ticketPagination.save(key, found)
            return false
          }
          if (count >= maximum) {
            await notify(formatScheduledFinished(request))
            return false
          }
          await notify(formatScheduledWaiting(request, maximum - count))
          return true
        },
        onError: async (error, count, maximum) => {
          this.logError(error)
          const suffix = count >= maximum ? '，本次定时查询已结束' : '，稍后将继续查询'
          await notify(`${getPublicErrorMessage(error)}${suffix}`, { render: false })
        }
      })
      await this.replyRenderedText(formatScheduledWaiting(request, 9))
    } catch (error) {
      this.logError(error)
      await this.reply(getPublicErrorMessage(error))
    }
    return true
  }

  async handleCancelTicket() {
    const cancelled = scheduledTicketTasks.cancel(getTicketSessionKey(this.e))
    await this.replyRenderedText(cancelled ? '已取消定时车票查询任务' : '当前没有正在进行的定时车票查询任务')
    return true
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
      return this.execute(COMMANDS.trainNumber, '', queryTrainDetails, formatTrainDetails, {
        shouldRender: (result) => result.stops.length > 0
      })
    }
    return this.execute(COMMANDS.trainNumber, '', queryTrainAssignments, formatTrainAssignments, {
      shouldRender: (result) => result.records.length > 0
    })
  }

  async handleTrainInfo() {
    return this.execute(COMMANDS.trainInfo, '请输入列车车次，例如：#查询 G123', queryTrainDetails, formatTrainDetails, {
      shouldRender: (result) => result.stops.length > 0
    })
  }

  async handleRealtime() {
    return this.execute(COMMANDS.realtime, '请输入列车车次，例如：#实时 G123', queryRealtimeStatus, formatRealtimeStatus, {
      shouldRender: () => true
    })
  }

  async handleStationScreen() {
    return this.execute(COMMANDS.stationScreen, '请输入车站名称，例如：#大屏 上海', queryStationScreen, formatStationScreen, {
      shouldRender: (result) => result.trains.length > 0
    })
  }

  async handleRoute() {
    return this.execute(COMMANDS.route, '请输入线路名称，例如：#线路 京沪高铁', queryRoute, formatRoute, {
      shouldRender: () => true
    })
  }

  async handleStation() {
    return this.execute(COMMANDS.station, '请输入车站名称，例如：#车站 上海', queryStation, formatStation, {
      shouldRender: () => true
    })
  }
}
