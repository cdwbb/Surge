# Surge 每日信息中心（成都版）

适用于 Surge iOS 6.100.0 的单个 Module，提供五张彼此独立的面板：成都天气、日期与节假日、成都空气质量、网络健康、四川油价。面板刷新只读取/展示数据，不调用通知 API；三类通知由独立 Cron 脚本处理。**不含限行功能，也没有统一首页。**

## 面板

| 面板 | 内容 | 更新周期 | 数据和限制 |
| --- | --- | ---: | --- |
| 成都天气 | 当前温度、体感、天气、湿度、风速、今日高低温和未来 4 天预报 | 30 分钟 | Open-Meteo 官方 JSON API 的天气模型整合结果，不是成都气象台站点实测；请求失败显示本面板缓存 |
| 日期与节假日 | 公历、星期、农历、节假日、周末和调休上班识别 | 6 小时 | `config/holidays.json`；2026 年按国务院办公厅安排维护，2027 年标记待确认。农历换算表现维护至 2026 年 |
| 成都空气质量 | US AQI、PM2.5、PM10、等级及健康提示 | 30 分钟 | Open-Meteo Air Quality API，约 11 km 网格模型估算，不是官方监测站实时数据；请求失败显示缓存 |
| 网络健康 | Surge 提供的网络类型、IPv4/IPv6、DNS，以及两项 HTTP(S) 连通性耗时 | 5 分钟 | HTTP(S) 探测不是 ICMP Ping；目标和超时可在 `settings.json` 调整 |
| 四川油价 | 92/95 号汽油、0 号柴油、执行日期和公告来源 | 6 小时 | 不解析不稳定的第三方页面。没有可核对的最新官方四川价格时明确显示“暂无可靠官方数据” |

## 导入与刷新

1. 在 GitHub `cdwbb/Surge` 仓库的 `surge-daily-v1` 分支打开 `Surge/Daily/Daily.sgmodule`，复制 Raw URL。
2. 在 iPhone Surge → **模块** → **安装新模块**，粘贴 URL 并安装/启用。确认 Surge 的 Scripting 已开启。
3. 到 Surge 面板列表中分别点开五张卡片，使用各卡片自己的刷新操作。每张卡片可单独手动刷新；Module 为各卡片设置独立 `update-interval`。
4. 首次打开时脚本从该分支的 GitHub Raw 地址加载。没有网络时天气/空气使用本地持久缓存；节假日、油价也缓存配置数据。脚本执行完后 Surge 继续显示最后一份面板结果。

## Cron 通知

Module 参数提供：

| 参数 | 默认 | 说明 |
| --- | --- | --- |
| 天气通知 | `0` | `1` 开启独立 Cron；气温不高于配置低温阈值或不低于高温阈值时提醒 |
| 空气通知 | `0` | `1` 开启独立 Cron；模型 US AQI 超过阈值时提醒 |
| 油价通知 | `0` | `1` 开启独立 Cron；仅在配置中有来源链接的官方数据发生变化时提醒 |
| 通知时间 | `0 8 * * *` | 标准五段 Cron，默认每日 08:00。Surge iOS Cron 可用 `wake-system=1` |

Module 参数还提供「天气刷新、日历刷新、空气刷新、网络刷新、油价刷新」，单位为秒，分别控制五张卡片。参数修改不需要编辑代码。

通知脚本各自请求数据、使用不同 `$persistentStore` key 记录状态。持续处于同一告警状态只通知一次；恢复正常后重新布防。油价初次读取只建立基线，后续价格签名变化才通知。关闭的通知不发请求。空气提醒文字会注明指数是模型估算。任何通知脚本失败均只结束该次 Cron，不影响面板。

## 配置

- `config/settings.json`：城市名称、经纬度、时区、预报范围、缓存 key、天气冷热阈值、AQI 阈值、网络探测地址/超时，以及油价数据槽位。
- `config/holidays.json`：按年份维护节假日、调休工作日、安排状态和农历月首日期。更新新年度时先确认国务院办公厅公告，再分别填写假期和调休工作日；未公布年份保留 `unconfirmed`，不要按普通周末推断整年放假安排。
- `js/*_Panel.js` 与 `js/*_Notify.js`：面板与通知实现严格分离。
- `Daily.sgmodule`：Panel 名称、generic/Cron 脚本映射；五个独立刷新周期也可以在 Module 参数中修改。

### 修改默认城市

编辑 `config/settings.json` 的 `city.name`、`city.latitude`、`city.longitude`、`city.timezone`。天气与空气 API 使用坐标；网络面板不依赖城市。提交并推送分支后，已安装 Module 的脚本会从分支读取新配置。要改脚本代码，则升级 Surge 中该 Module/脚本。

### 更新节假日

编辑 `config/holidays.json` 对应年份的 `holidays`、`workdays`、`status` 和农历数据，记录权威来源链接。节假日和调休上班日期应显式登记；其余日期只按普通工作日/周末判断。未确认的未来年份应标为 `unconfirmed`。

### 更新官方油价

只在拿到可核验的四川省发改委或国家发改委官方公告后，更新 `oil.status` 为 `official`，填写 `effectiveDate`、`prices`、`sourceName`、`sourceUrl`。公告没有公布四川零售价时继续显示暂无数据；`forecastDate` 仅允许在具有可靠依据时填写，并要标明预测性质。油价通知需要参数开启且价格数据与来源链接齐全。

## 缓存和数据时效

天气、空气、节假日分别使用独立持久化缓存 key；油价缓存官方配置；网络缓存最后探测结果以便诊断。缓存没有人为伪造时间戳：天气/空气显示 API 返回的时次，日历显示本机刷新时间；从缓存回退时显式标注可能过期。Surge persistent store 仅存字符串，脚本在每次读写处处理 JSON 解析失败。

## 故障排查

- **面板脚本无法加载**：检查 Surge 网络、模块启用状态、脚本 URL 的分支名是否为 `surge-daily-v1`，并确认 `Surge/Daily/js/` 路径大小写。
- **天气/空气为空或缓存旧**：确认 Open-Meteo API 可连通，稍后手动刷新；检查卡片中的数据时次和缓存提示。
- **节假日数据未更新**：检查 GitHub Raw 是否可访问；旧缓存会显示缓存提示。核对 JSON 语法和年份 key。
- **网络探测异常**：HTTP(S) 探测受当前网络、代理策略、目标服务和 TLS 状态影响；异常表示探测失败，不等于 ICMP 丢包。
- **未收到通知**：检查对应通知参数是否为 `1`、Cron 格式是否有效、系统通知和 Surge 后台刷新设置；通知阈值只在 `settings.json` 调整。首个有效油价 Cron 只建立基线。
- **油价显示暂无数据**：这是缺少可靠官方四川价格数据时的预期结果；请不要用第三方抓取值替换官方来源数据。

## 已知限制

- 天气和空气质量依赖 Open-Meteo 服务及模型网格分辨率；不能当作官方观测站或专业预警依据。
- 农历数据随 `holidays.json` 人工逐年更新，目前仅含 2026 年换算表；其他年份明确提示待更新。
- 油价没有可靠、稳定的官方 JSON API，因此不做不稳定网页解析；价格数据需按官方公告维护。
- 面板更新周期是 Surge 面板访问时检查的周期，不保证后台精确到点运行。
- 当前只能做静态检查/脚本模拟；没有 iPhone Surge 6.100.0 真机运行环境，不能宣称完成真机验证。

## 当前核验依据

- Surge [Information Panel](https://manual.nssurge.com/tools/panel.html)、[Generic Script](https://manual.nssurge.com/scripting/generic.html)、[Cron Script](https://manual.nssurge.com/scripting/cron.html)、[JavaScript API](https://manual.nssurge.com/scripting/api.html)。
- Open-Meteo [Weather Forecast API](https://open-meteo.com/en/docs)、[Air Quality API](https://open-meteo.com/en/docs/air-quality-api)。
- 2026 节假日：[国务院公报通知](https://www.gov.cn/gongbao/2025/issue_12406/material/gwygb202532.pdf)；农历：[香港天文台 2026 对照表](https://www.hko.gov.hk/en/gts/time/calendar/text/files/T2026e.txt)。
- 油价判断：[国家发展改革委 2026-11-12 调价公告](https://www.ndrc.gov.cn/xwdt/xwfb/202611/t20261112_1408795.html)；四川省发改委价格公报用于确认官方数据发布口径。
