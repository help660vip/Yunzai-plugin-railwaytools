# 命令渲染测试报告

- 执行时间：2026-08-14T12:11:46.765Z
- Node.js：v22.23.2
- 平台：win32 x64
- 截图环境：Chrome Headless 临时 HTML（CDP 真实截图）
- 命令实现文件：`apps/railway-tools.js`
- 触发格式：Yunzai 消息事件中的 `#命令 参数`；英文参数大小写不敏感并兼容连续空白。
- 数据策略：直接调用当前插件的真实上游接口，不使用伪造成功数据。

| 实际触发格式 | 预期输出 | 实际输出 | 结果 | 图片验收 | 说明 | 截图 |
|---|---|---|---|---|---|---|
| #车迷帮助 | 有效结果为 Puppeteer 图片；空结果、错误或渲染失败为普通文字 | 1 张真实 PNG（Chrome Headless） | PASS | 数量=1；尺寸=692×1090；分页=单页；字体/背景/GitHub完整地址=https://github.com/help660vip/Yunzai-plugin-railwaytools；请查看真实 PNG | 生成 1 张真实截图 | [images/help-default-1.png](images/help-default-1.png) |
| #查询 G895 | 有效结果为 Puppeteer 图片；空结果、错误或渲染失败为普通文字 | 1 张真实 PNG（Chrome Headless） | PASS | 数量=1；尺寸=575×499；分页=单页；字体/背景/GitHub完整地址=https://github.com/help660vip/Yunzai-plugin-railwaytools；请查看真实 PNG | 生成 1 张真实截图 | [images/train-query-g895-1.png](images/train-query-g895-1.png) |
| #查询 G6005 | 有效结果为 Puppeteer 图片；空结果、错误或渲染失败为普通文字 | 1 张真实 PNG（Chrome Headless） | PASS | 数量=1；尺寸=451×425；分页=单页；字体/背景/GitHub完整地址=https://github.com/help660vip/Yunzai-plugin-railwaytools；请查看真实 PNG | 生成 1 张真实截图 | [images/train-query-g6005-1.png](images/train-query-g6005-1.png) |
| #查询 C7213 | 有效结果为 Puppeteer 图片；空结果、错误或渲染失败为普通文字 | 1 张真实 PNG（Chrome Headless） | PASS | 数量=1；尺寸=479×573；分页=单页；字体/背景/GitHub完整地址=https://github.com/help660vip/Yunzai-plugin-railwaytools；请查看真实 PNG | 生成 1 张真实截图 | [images/train-query-c7213-1.png](images/train-query-c7213-1.png) |
| #查询 D169 | 有效结果为 Puppeteer 图片；空结果、错误或渲染失败为普通文字 | 1 张真实 PNG（Chrome Headless） | PASS | 数量=1；尺寸=568×622；分页=单页；字体/背景/GitHub完整地址=https://github.com/help660vip/Yunzai-plugin-railwaytools；请查看真实 PNG | 生成 1 张真实截图 | [images/train-query-d169-1.png](images/train-query-d169-1.png) |
| #查询 T222 | 有效结果为 Puppeteer 图片；空结果、错误或渲染失败为普通文字 | 1 张真实 PNG（Chrome Headless） | PASS | 数量=1；尺寸=537×622；分页=单页；字体/背景/GitHub完整地址=https://github.com/help660vip/Yunzai-plugin-railwaytools；请查看真实 PNG | 生成 1 张真实截图 | [images/train-query-t222-1.png](images/train-query-t222-1.png) |
| #车次 G895 | 有效结果为 Puppeteer 图片；空结果、错误或渲染失败为普通文字 | 1 张真实 PNG（Chrome Headless） | PASS | 数量=1；尺寸=575×499；分页=单页；字体/背景/GitHub完整地址=https://github.com/help660vip/Yunzai-plugin-railwaytools；请查看真实 PNG | 生成 1 张真实截图 | [images/train-number-g895-1.png](images/train-number-g895-1.png) |
| #实时 G895 | 有效结果为 Puppeteer 图片；空结果、错误或渲染失败为普通文字 | 1 张真实 PNG（Chrome Headless） | PASS | 数量=1；尺寸=720×375；分页=单页；字体/背景/GitHub完整地址=https://github.com/help660vip/Yunzai-plugin-railwaytools；请查看真实 PNG | 生成 1 张真实截图 | [images/realtime-g895-1.png](images/realtime-g895-1.png) |
| #车号 G895 | 有效结果为 Puppeteer 图片；空结果、错误或渲染失败为普通文字 | 1 张真实 PNG（Chrome Headless） | PASS | 数量=1；尺寸=463×425；分页=单页；字体/背景/GitHub完整地址=https://github.com/help660vip/Yunzai-plugin-railwaytools；请查看真实 PNG | 生成 1 张真实截图 | [images/emu-number-g895-1.png](images/emu-number-g895-1.png) |
| #车次 CR400AFAE-2402 | 有效结果为 Puppeteer 图片；空结果、错误或渲染失败为普通文字 | 1 张真实 PNG（Chrome Headless） | PASS | 数量=1；尺寸=602×425；分页=单页；字体/背景/GitHub完整地址=https://github.com/help660vip/Yunzai-plugin-railwaytools；请查看真实 PNG | 生成 1 张真实截图 | [images/train-number-cr400afae-2402-1.png](images/train-number-cr400afae-2402-1.png) |
| #大屏 上海虹桥 | 有效结果为 Puppeteer 图片；空结果、错误或渲染失败为普通文字 | 1 张真实 PNG（Chrome Headless） | PASS | 数量=1；尺寸=720×1460；分页=单页；字体/背景/GitHub完整地址=https://github.com/help660vip/Yunzai-plugin-railwaytools；请查看真实 PNG | 生成 1 张真实截图 | [images/station-screen-1.png](images/station-screen-1.png) |
| #车站 上海虹桥 | 有效结果为 Puppeteer 图片；空结果、错误或渲染失败为普通文字 | 1 张真实 PNG（Chrome Headless） | PASS | 数量=1；尺寸=444×696；分页=单页；字体/背景/GitHub完整地址=https://github.com/help660vip/Yunzai-plugin-railwaytools；请查看真实 PNG | 生成 1 张真实截图 | [images/station-1.png](images/station-1.png) |
| #线路 京沪高速铁路 | 有效结果为 Puppeteer 图片；空结果、错误或渲染失败为普通文字 | 1 张真实 PNG（Chrome Headless） | PASS | 数量=1；尺寸=720×1016；分页=单页；字体/背景/GitHub完整地址=https://github.com/help660vip/Yunzai-plugin-railwaytools；请查看真实 PNG | 生成 1 张真实截图 | [images/route-1.png](images/route-1.png) |
| #铁路百科 CR400AF | 有效结果为 Puppeteer 图片；空结果、错误或渲染失败为普通文字 | 1 张真实 PNG（Chrome Headless） | PASS | 数量=1；尺寸=720×400；分页=单页；字体/背景/GitHub完整地址=https://github.com/help660vip/Yunzai-plugin-railwaytools；请查看真实 PNG | 生成 1 张真实截图 | [images/encyclopedia-cr400af-1.png](images/encyclopedia-cr400af-1.png) |
| #铁路百科 线路 宣杭铁路 | 有效结果为 Puppeteer 图片；空结果、错误或渲染失败为普通文字 | 1 张真实 PNG（Chrome Headless） | PASS | 数量=1；尺寸=591×425；分页=单页；字体/背景/GitHub完整地址=https://github.com/help660vip/Yunzai-plugin-railwaytools；请查看真实 PNG | 生成 1 张真实截图 | [images/encyclopedia-1.png](images/encyclopedia-1.png) |
| #随机列车 | 有效结果为 Puppeteer 图片；空结果、错误或渲染失败为普通文字 | 1 张真实 PNG（Chrome Headless） | PASS | 数量=1；尺寸=632×400；分页=单页；字体/背景/GitHub完整地址=https://github.com/help660vip/Yunzai-plugin-railwaytools；请查看真实 PNG | 生成 1 张真实截图 | [images/random-train-default-1.png](images/random-train-default-1.png) |
| #机车信息 HXD1D-1898 | 实拍图消息段与普通文字，不进行 Puppeteer 渲染 | 实拍图消息段与普通文字 | PASS | SKIP（按产品规则不使用 Puppeteer） | 保持原生消息；未调用 Puppeteer | SKIP（无截图） |

## 判定说明

- `PASS`：业务查询和预期输出方式均成功；截图链接由 TRSS-Yunzai 共享 Puppeteer 或测试专用 Chrome Headless 实际生成。
- `SKIP-IMAGE`：业务查询成功，但当前 Node.js 没有 WebSocket 或未检测到 TRSS、Chrome/Chromium；图片验收未假定通过。
- `EMPTY`：真实接口没有返回有效记录，保持普通文字空结果。
- `FAIL` / `FAIL-IMAGE`：真实接口或截图运行失败，错误已如实记录。
- `#机车信息` 按产品规则保留实拍图消息段与普通文字，不进行 Puppeteer 渲染，文字中不得包含 URL。
- 图片页脚显示完整地址 `https://github.com/help660vip/Yunzai-plugin-railwaytools`；该 URL 仅存在于图片像素中。
