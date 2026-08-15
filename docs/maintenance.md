# 维护说明

本文说明运行边界、缓存策略和验证方式。安装与命令用法见项目根目录 [README](../README.md)。

## 代码边界

- `apps/railway-tools.js`：Yunzai 规则、参数入口与回复策略。
- `model/api.js`、`model/ticket-api.js`：铁路与 12306 网络请求。
- `model/cached-api.js`、`model/ticket-cached-api.js`：数据获取层的缓存包装。
- `model/services.js`、`model/ticket-service.js`：业务解析与结果结构。
- `model/ticket-parser.js`：车票日期、精确站名、时段和间隔解析。
- `model/ticket-sessions.js`：5 分钟翻页会话和定时任务生命周期。
- `model/render-text-image.js`：普通查询结果图片。
- `model/render-menu-image.js`：结构化帮助菜单图片。

命令处理器不应直接拼接 URL、解析 12306 原始字段或维护缓存键。

## 缓存

缓存入口是 `model/cache.js`。默认适配器只使用进程内存；替换实现时需提供异步 `get`、`set`、`delete` 和 `clear`。

| 数据类型 | 有效时间 | 陈旧回退 |
| --- | ---: | ---: |
| 车站大屏 | 20 秒 | 1 分钟 |
| 12306 余票 | 15 秒 | 30 秒 |
| 列车时刻 | 1 分钟 | 4 分钟 |
| 动车组担当 | 5 分钟 | 30 分钟 |
| 12306 票价 | 15 分钟 | 1 小时 |
| cnrail 搜索 | 6 小时 | 2 天 |
| 车站电报码、线路和车站详情 | 24 小时 | 7 天 |

同一缓存键的并发请求会合并。刷新失败时只允许在陈旧回退期限内返回旧值；缓存适配器本身不可用时，查询直接访问数据源。

## 车票查询

12306 车票实现不依赖 Python、NoneBot、Redis或外部定时包。HTTP 使用 Node.js 内置 `fetch`，查询会话先从初始化页面发现当前余票接口，再携带会话 Cookie 请求。

原始余票字段只在 `ticket-service.js` 转换。票价接口单独失败时保留车次与余票数量，避免一个价格请求使整页不可用。

翻页会话按机器人、群聊和用户隔离。定时任务使用串行 `setTimeout`，前一次请求完成后才安排下一次，防止慢接口导致并发重叠。插件重启后内存中的翻页和定时任务均会清空。

## 实时状态 Provider

`model/realtime-provider.js` 定义可替换 Provider。当前实现复用列车详情，根据当日时刻和正晚点字段生成参考状态。未来接入正式实时接口时，应新增 Provider，而不是修改命令处理器。

## 图片渲染

正式插件只使用 TRSS-Yunzai 提供的共享 Puppeteer。普通结果与菜单使用不同 HTML 构建器，但共享背景、字体回退、仓库页脚和页面关闭要求。

测试专用 `command-render-tests/chrome-renderer.js` 可以使用系统 Chrome 和临时 HTML 生成真实 PNG。临时浏览器资料与 HTML 在 `finally` 中清理，不写入运行目录。

## 验证

~~~bash
npm run check
npm test
npm run test:render
~~~

- `npm run check`：检查全部运行、测试和截图脚本的 JavaScript 语法。
- `npm test`：覆盖加载、命令规则、输入容错、缓存、车票解析/服务/会话和图片失败回退。
- `npm run test:render`：访问真实铁路与 12306 数据源，为当前全部功能生成 PNG。

真实命令结果见 [验证报告](../command-render-tests/report.md)。截图任务使用暂存目录，只有所有命令通过后才替换 `command-render-tests/images/`。
