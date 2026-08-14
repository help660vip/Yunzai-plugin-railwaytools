# Yunzai-plugin-railwaytools

适用于 Yunzai-Bot 的铁路信息查询插件，提供列车、动车组、车站、线路和机车信息查询。

## 功能介绍

- 查询列车基本信息、担当单位、车型、配属和停站时刻表
- 查询列车实时运行状态和正晚点信息
- 查询动车组近期担当记录
- 查询车站大屏、车站资料和铁路线路资料
- 查询机车及动车组配属、生产厂家和图片资料
- 自动兼容英文大小写、连续空格、全角空格和常见复制粘贴空白字符

## 运行环境

- Linux 服务器
- Yunzai-Bot V3 或兼容其插件接口的实现
- Node.js 18.18 或更高版本

查询成功后的多行详情默认渲染为图片。插件直接复用 TRSS-Yunzai 的共享 Puppeteer，不需要安装额外截图依赖；Puppeteer 不可用或渲染失败时会自动返回原始文字。

Linux 服务器建议安装中文字体。渲染字体按 `Microsoft YaHei`、`Microsoft YaHei UI`、`PingFang SC`、`WenQuanYi Micro Hei`、`Noto Sans CJK SC`、`sans-serif` 的顺序回退。

## 安装方法

在 Yunzai-Bot 根目录执行：

~~~bash
git clone https://github.com/help660vip/Yunzai-plugin-railwaytools.git plugins/Yunzai-plugin-railwaytools
~~~

插件不需要额外的运行时 npm 依赖。克隆完成后重启 Yunzai-Bot。

更新插件时，在 Yunzai-Bot 根目录执行：

~~~bash
git -C plugins/Yunzai-plugin-railwaytools pull
~~~

## 使用方法

命令必须以 # 开头。命令与参数之间可使用一个或多个空白字符；包含英文字母的编号不区分大小写。

例如，以下命令效果一致：

~~~text
#车次 G123
#车次 g123
#车次    G123
~~~

## 命令列表

| 命令 | 说明 | 示例 |
| --- | --- | --- |
| `#车次 [车次或动车组编号]` | 查询列车详情；输入动车组编号时查询近期担当车次 | `#车次 G123` |
| `#查询 [车次]` | 查询列车详情和停站时刻 | `#查询 Z225` |
| `#查询 [车次] -实时` | 查询列车详情、当前位置和正晚点 | `#查询 Z225 -实时` |
| `#车号 [车次]` | 查询列车近期担当的动车组车号 | `#车号 D3211` |
| `#大屏 [车站名]` | 查询车站大屏，最多显示 10 条 | `#大屏 上海` |
| `#线路 [线路名]` | 查询铁路线路及沿途车站 | `#线路 宣杭铁路` |
| `#车站 [车站名]` | 查询国铁车站基本信息 | `#车站 上海` |
| `#车站 [地铁站名]地铁站` | 查询地铁车站基本信息 | `#车站 人民广场地铁站` |
| `#机车信息 [车号]` | 查询机车或动车组档案 | `#机车信息 HXD1D-1898` |
| `#车迷帮助` | 显示插件帮助菜单 | `#车迷帮助` |

`#机车信息` 保留档案实拍图和普通文字详情，不进行 Puppeteer 图片渲染，也不会在群消息中发送档案数据项目地址。

插件还保留了常用的 `#ch`、`#cc`、`#cx`、`#dp`、`#xl`、`#cz` 和 `#jcxx` 简写命令。

## 配置说明

插件默认不需要配置文件。铁路数据通过公开或第三方数据接口实时获取，请确保 Yunzai-Bot 所在服务器能够访问相关数据源。

## 数据来源

- 列车信息与时刻表：12306
- 动车组担当记录：rail.re
- 车站大屏：12036.com 第三方接口
- 车站与线路资料：cnrail.geogv.org
- 机车与动车组档案：[CR-Locomotive-Allocation](https://github.com/leaf2006/CR-Locomotive-Allocation)

数据可能延迟、缺失或因接口调整暂时不可用，仅供查询参考。车站大屏、正晚点和开行状态不得作为乘车依据，实际信息以铁路运营方公告为准。

## 来源与致谢

本项目包含基于 [leaf2006/nonebot-plugin-railwaytools](https://github.com/leaf2006/nonebot-plugin-railwaytools) 的 MIT 许可代码所形成的实现。原始版权和许可信息见 [NOTICE.md](NOTICE.md)。

感谢各数据服务及开源项目维护者提供公开资料与接口。

## License

本项目以 [GNU General Public License v3.0](LICENSE) 发布。原项目相关代码的 MIT 许可声明保留于 [NOTICE.md](NOTICE.md)。
