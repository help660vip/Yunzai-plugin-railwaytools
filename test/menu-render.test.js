import assert from 'node:assert/strict'
import test from 'node:test'

import { MAIN_HELP_MENU, menuToText, TICKET_HELP_MENU } from '../model/help-menu.js'
import { buildMenuHtml } from '../model/render-menu-image.js'

test('main help is compact, structured and only lists supported commands', () => {
  const html = buildMenuHtml(MAIN_HELP_MENU, { backgroundUrl: 'https://example.test/background.jpg' })
  assert.match(html, /class="command-row"/u)
  assert.match(html, /width: max-content/u)
  assert.match(html, /grid-template-columns: fit-content\(330px\) fit-content\(260px\)/u)
  assert.match(html, /background: rgba\(0, 0, 0, \.12\)/u)
  assert.match(html, /background: rgba\(22, 24, 29, \.54\)/u)
  assert.match(html, /#查询车票 北京南 上海虹桥 明天/u)
  assert.match(html, /#下一页 \/ next/u)
  assert.doesNotMatch(html, /大小写|连续空格|复制空白/u)
  assert.doesNotMatch(html, /#机车信息|#铁路百科|#随机列车/u)
  assert.doesNotMatch(html, /Powered by/u)
})

test('ticket help documents dates, exact matching, schedules and pagination', () => {
  const text = menuToText(TICKET_HELP_MENU)
  assert.match(text, /today、tomorrow/u)
  assert.match(text, /-精确站名/u)
  assert.match(text, /-精确发站/u)
  assert.match(text, /-精确到站/u)
  assert.match(text, /#定时查询车票/u)
  assert.match(text, /#下一页/u)
  assert.match(text, /next/u)
})
