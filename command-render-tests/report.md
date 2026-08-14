# 命令渲染测试报告

- 执行时间：2026-08-14T09:43:59.342Z
- Node.js：v22.23.2
- 平台：win32 x64
- 截图环境：当前工作区未检测到 TRSS-Yunzai Puppeteer 运行时
- 命令实现文件：`apps/railway-tools.js`
- 触发格式：Yunzai 消息事件中的 `#命令 参数`；英文参数大小写不敏感并兼容连续空白。
- 数据策略：直接调用当前插件的真实上游接口，不使用伪造成功数据。

| 实际触发格式 | 预期输出 | 实际输出 | 结果 | 图片验收 | 说明 | 截图 |
|---|---|---|---|---|---|---|
| #车迷帮助 | 有效结果为 Puppeteer 图片；空结果、错误或渲染失败为普通文字 | 业务文字已生成；图片未生成 | SKIP-IMAGE | SKIP（未生成 PNG；数量、尺寸、分页、字体、背景与 GitHub 页脚均未验收） | 业务结果有效；当前环境无 TRSS Puppeteer，跳过截图 | SKIP（无截图） |
| #查询 G895 | 有效结果为 Puppeteer 图片；空结果、错误或渲染失败为普通文字 | 业务文字已生成；图片未生成 | SKIP-IMAGE | SKIP（未生成 PNG；数量、尺寸、分页、字体、背景与 GitHub 页脚均未验收） | 业务结果有效；当前环境无 TRSS Puppeteer，跳过截图 | SKIP（无截图） |
| #查询 G6005 | 有效结果为 Puppeteer 图片；空结果、错误或渲染失败为普通文字 | 业务文字已生成；图片未生成 | SKIP-IMAGE | SKIP（未生成 PNG；数量、尺寸、分页、字体、背景与 GitHub 页脚均未验收） | 业务结果有效；当前环境无 TRSS Puppeteer，跳过截图 | SKIP（无截图） |
| #查询 C7213 | 有效结果为 Puppeteer 图片；空结果、错误或渲染失败为普通文字 | 业务文字已生成；图片未生成 | SKIP-IMAGE | SKIP（未生成 PNG；数量、尺寸、分页、字体、背景与 GitHub 页脚均未验收） | 业务结果有效；当前环境无 TRSS Puppeteer，跳过截图 | SKIP（无截图） |
| #查询 D169 | 有效结果为 Puppeteer 图片；空结果、错误或渲染失败为普通文字 | 业务文字已生成；图片未生成 | SKIP-IMAGE | SKIP（未生成 PNG；数量、尺寸、分页、字体、背景与 GitHub 页脚均未验收） | 业务结果有效；当前环境无 TRSS Puppeteer，跳过截图 | SKIP（无截图） |
| #查询 T222 | 有效结果为 Puppeteer 图片；空结果、错误或渲染失败为普通文字 | 业务文字已生成；图片未生成 | SKIP-IMAGE | SKIP（未生成 PNG；数量、尺寸、分页、字体、背景与 GitHub 页脚均未验收） | 业务结果有效；当前环境无 TRSS Puppeteer，跳过截图 | SKIP（无截图） |
| #车次 G895 | 有效结果为 Puppeteer 图片；空结果、错误或渲染失败为普通文字 | 业务文字已生成；图片未生成 | SKIP-IMAGE | SKIP（未生成 PNG；数量、尺寸、分页、字体、背景与 GitHub 页脚均未验收） | 业务结果有效；当前环境无 TRSS Puppeteer，跳过截图 | SKIP（无截图） |
| #车号 G895 | 有效结果为 Puppeteer 图片；空结果、错误或渲染失败为普通文字 | 业务文字已生成；图片未生成 | SKIP-IMAGE | SKIP（未生成 PNG；数量、尺寸、分页、字体、背景与 GitHub 页脚均未验收） | 业务结果有效；当前环境无 TRSS Puppeteer，跳过截图 | SKIP（无截图） |
| #车次 CR400AFAE-2402 | 有效结果为 Puppeteer 图片；空结果、错误或渲染失败为普通文字 | 业务文字已生成；图片未生成 | SKIP-IMAGE | SKIP（未生成 PNG；数量、尺寸、分页、字体、背景与 GitHub 页脚均未验收） | 业务结果有效；当前环境无 TRSS Puppeteer，跳过截图 | SKIP（无截图） |
| #大屏 上海虹桥 | 有效结果为 Puppeteer 图片；空结果、错误或渲染失败为普通文字 | 业务文字已生成；图片未生成 | SKIP-IMAGE | SKIP（未生成 PNG；数量、尺寸、分页、字体、背景与 GitHub 页脚均未验收） | 业务结果有效；当前环境无 TRSS Puppeteer，跳过截图 | SKIP（无截图） |
| #车站 上海虹桥 | 有效结果为 Puppeteer 图片；空结果、错误或渲染失败为普通文字 | 业务文字已生成；图片未生成 | SKIP-IMAGE | SKIP（未生成 PNG；数量、尺寸、分页、字体、背景与 GitHub 页脚均未验收） | 业务结果有效；当前环境无 TRSS Puppeteer，跳过截图 | SKIP（无截图） |
| #线路 京沪高速铁路 | 有效结果为 Puppeteer 图片；空结果、错误或渲染失败为普通文字 | 业务文字已生成；图片未生成 | SKIP-IMAGE | SKIP（未生成 PNG；数量、尺寸、分页、字体、背景与 GitHub 页脚均未验收） | 业务结果有效；当前环境无 TRSS Puppeteer，跳过截图 | SKIP（无截图） |
| #机车信息 HXD1D-1898 | 实拍图消息段与普通文字，不进行 Puppeteer 渲染 | 实拍图消息段与普通文字 | PASS | SKIP（按产品规则不使用 Puppeteer） | 保持原生消息；未调用 Puppeteer | SKIP（无截图） |

## 判定说明

- `PASS`：业务查询和预期输出方式均成功；若存在截图链接，文件由 TRSS-Yunzai 的共享 Puppeteer 实际生成。
- `SKIP-IMAGE`：业务查询成功，但独立工作区没有 TRSS-Yunzai Puppeteer；图片数量、尺寸、分页、字体、背景与 GitHub 页脚均未假定通过。
- `EMPTY`：真实接口没有返回有效记录，保持普通文字空结果。
- `FAIL` / `FAIL-IMAGE`：真实接口或截图运行失败，错误已如实记录。
- `#机车信息` 按产品规则保留实拍图消息段与普通文字，不进行 Puppeteer 渲染，文字中不得包含 URL。
