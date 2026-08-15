export const MAIN_HELP_MENU = Object.freeze({
  title: '车迷工具箱',
  subtitle: '列车、车站、线路与 12306 车票查询',
  sections: [
    {
      title: '列车与车组',
      items: [
        { command: '#车迷帮助', description: '打开铁路工具箱总菜单' },
        { command: '#车次 G123', description: '列车详情、车型与完整停站时刻' },
        { command: '#车次 CRH2A-2001', description: '按动车组号反查近期担当车次' },
        { command: '#车号 G123', description: '查询近期担当的动车组号' },
        { command: '#查询 G123 -实时', description: '列车详情与今日运行状态' },
        { command: '#实时 G123', description: '查询列车当前运行状态' }
      ]
    },
    {
      title: '车站与线路',
      items: [
        { command: '#大屏 上海', description: '车站列车、候车位置与状态' },
        { command: '#线路 京沪高铁', description: '线路资料与沿途车站' },
        { command: '#车站 上海', description: '国铁车站或地铁站资料' }
      ]
    },
    {
      title: '12306 车票',
      items: [
        { command: '#查询车票 北京南 上海虹桥 明天', description: '查询余票、席别与票价' },
        { command: '#定时查询车票 湖州 厦门北 14-16 10分钟', description: '定时检查指定时段余票' },
        { command: '#取消查询车票', description: '结束当前定时查询任务' },
        { command: '#下一页 / next', description: '继续查看下一批 10 趟列车' },
        { command: '#车票帮助', description: '查看日期、精确站名与定时格式' }
      ]
    }
  ]
})

export const TICKET_HELP_MENU = Object.freeze({
  title: '车票查询帮助',
  subtitle: '12306 余票、票价、翻页与定时检查',
  sections: [
    {
      title: '普通查询',
      items: [
        { command: '#查询车票 北京南 上海虹桥', description: '未填写日期时查询今天' },
        { command: '#查询车票 北京南 上海虹桥 明天', description: '也支持 today、tomorrow' },
        { command: '#查询车票 北京南 上海虹桥 2026-08-16', description: '支持 YYYY-MM-DD' },
        { command: '#查询车票 北京南 上海虹桥 2026年8月16日', description: '支持中文年月日' }
      ]
    },
    {
      title: '精确站名',
      items: [
        { command: '-精确站名', description: '精确匹配发站与到站' },
        { command: '-精确发站', description: '只精确匹配出发站' },
        { command: '-精确到站', description: '只精确匹配到达站' }
      ]
    },
    {
      title: '定时查询',
      items: [
        { command: '#定时查询车票 湖州 厦门北 10分钟', description: '每 10 分钟检查一次' },
        { command: '#定时查询车票 湖州 厦门北 明天 14-16 1小时', description: '日期、出发时段均可选' },
        { command: '#取消查询车票', description: '取消当前会话的定时任务' }
      ]
    },
    {
      title: '翻页',
      items: [
        { command: '#下一页', description: '查看下一批 10 趟列车' },
        { command: 'next', description: '与 #下一页 相同，5 分钟内有效' }
      ]
    }
  ]
})

export function menuToText(menu) {
  const lines = [`【${menu.title}】`, menu.subtitle]
  for (const section of menu.sections) {
    lines.push('', `—— ${section.title} ——`)
    for (const item of section.items) lines.push(`${item.command}  ${item.description}`)
  }
  if (menu.notes?.length) lines.push('', ...menu.notes.map((note) => `说明：${note}`))
  return lines.join('\n')
}
