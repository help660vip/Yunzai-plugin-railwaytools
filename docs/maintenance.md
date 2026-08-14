# 维护说明

本文面向插件维护者，记录运行实现、数据维护和测试方式。普通安装用户不需要执行这里的命令。

## 缓存

缓存入口位于 `model/cache.js`，数据获取层通过 `model/cached-api.js` 统一使用缓存。默认适配器只保存进程内存数据；替换缓存实现时，应实现异步 `get`、`set`、`delete` 和 `clear` 方法。

| 数据类型 | 有效时间 | 数据源异常时的短期回退 |
| --- | ---: | ---: |
| 车站大屏 | 20 秒 | 1 分钟 |
| 列车时刻与状态 | 1 分钟 | 4 分钟 |
| 动车组担当 | 5 分钟 | 30 分钟 |
| 车站和线路搜索 | 6 小时 | 2 天 |
| 车站、线路详情 | 24 小时 | 7 天 |
| 机车与动车组档案 | 6 小时 | 24 小时 |

同一缓存键的并发请求会合并为一次数据源调用。刷新失败时，只有仍在回退期限内的旧数据可以继续使用；无缓存或数据结构异常时，错误会正常返回业务层。

## 实时状态 Provider

`model/realtime-provider.js` 定义 Provider 注册与查询接口。当前 Provider 复用 `queryTrainDetails()`，根据当日时刻和正晚点字段生成参考状态。

接入新的数据源时，应新增独立 Provider 并注册到 `model/assistant-services.js`，不要把认证、请求或解析逻辑写入命令处理器。Provider 不可用时需要抛出带稳定错误码的异常，供业务层决定是否尝试下一个实现。

## 铁路百科

本地资料位于：

- `data/encyclopedia/train.json`
- `data/encyclopedia/locomotive.json`
- `data/encyclopedia/line.json`
- `data/encyclopedia/station.json`

每个条目至少包含 `id`、`name` 和 `summary`。可选字段包括 `category`、`aliases`、`details`、`fact`、`source` 和 `sourceId`。

线路或车站未命中本地资料时，`model/encyclopedia-provider.js` 会复用现有线路、车站查询和缓存层动态补全。车型和机车资料不使用模糊的网络结果自动补全。

### 同步候选数据

`tools/sync_encyclopedia.py` 使用 Python 标准库从 Wikidata 查询 `tools/encyclopedia-seeds.json` 中的候选实体：

~~~bash
python3 tools/sync_encyclopedia.py
python3 tools/sync_encyclopedia.py --apply
~~~

第一条命令只预览匹配结果。第二条命令会刷新带 `sourceId` 的自动同步条目，并原子写入通过校验的数据；人工编写且没有 `sourceId` 的条目不会被覆盖。

同步结果仍需人工检查名称、摘要、分类和实体 ID。没有可靠精确匹配的候选应保留为跳过状态。

## 图片渲染

正式插件只使用 TRSS-Yunzai 提供的共享 Puppeteer。渲染器接收最终文本，不参与业务字段的解析或重排。渲染异常必须回退原文字，并确保只回复一次。

`#机车信息` 明确不进入文字截图流程。缺少图片消息段能力时，实拍图应直接省略，不得把图片 URL 转为群消息文字。

## 测试

~~~bash
npm run check
npm test
npm run test:render
~~~

`npm test` 覆盖命令加载、输入容错、缓存、Provider、百科、随机列车和图片渲染。  
`npm run test:render` 访问真实铁路数据源，并使用 TRSS Puppeteer 或测试专用 Chrome Headless 生成 PNG。

真实命令报告保存在 [command-render-tests/report.md](../command-render-tests/report.md)，截图保存在 `command-render-tests/images/`。不得提交占位图或把接口失败记录成成功。
