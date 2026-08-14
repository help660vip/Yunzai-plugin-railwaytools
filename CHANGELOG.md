# Changelog

All notable version changes are documented in this file.

## 1.1.0 - 2026-08-14

- 查询成功后的多行详情支持图片回复。
- 复用 TRSS-Yunzai 共享 Puppeteer，并在渲染不可用或失败时回退为文字回复。
- 支持动态背景、长文本分页、HTML 转义和 Unicode 控制字符清理。
- `#机车信息` 保留实拍图和普通文字详情，群回复不发送档案数据项目 URL。

## 1.0.0 - 2026-08-14

- 提供列车详情、实时运行状态和停站时刻查询。
- 提供动车组担当、车站大屏、车站、线路及机车信息查询。
- 使用 Yunzai-Bot 消息事件、规则和回复接口。
- 命令统一使用 # 前缀，并支持大小写与 Unicode 空白容错。
- 支持 Node.js 18.18 及以上版本的 Linux 运行环境。
