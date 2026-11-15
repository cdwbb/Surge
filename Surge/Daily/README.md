# Surge 每日信息中心（成都版）

适用于 Surge iOS 6.100.0 的单个 Module，提供五张彼此独立的面板：成都天气、日期与节假日、成都空气质量、网络健康、四川油价。面板刷新只读取/展示数据，不调用通知 API；三类通知由独立 Cron 脚本处理。**不含限行功能，也没有统一首页。**

## 面板

| 面板 | 内容 | 更新周期 | 数据和限制 |
| --- | --- | ---: | --- |
| 成都天气 | 当前温度、体感、天气、湿度、风速、今日高低温和未来 4 天预报 | 30 分钟 | Open-Meteo 官方 JSON API 的天气模型整合结果，不是成都气象台站点实测；请求失败显示本面板缓存 |
| 日期与节假日 | 公历、星期、农历、节假日、周末和调休上班识别 | 6 小时 | `config/holidays.json`；2026 年按国务院办公厅安排维护，2027 年标记待确认。农历换算表现维护至 2026 年 |
| 成都空气质量 | US AQI、PM2.5、PM10、等级及健康提示 | 30 分钟 | Open-Meteo Air Quality API，约 11 km 网格模型估算，不是官方监测站实时数据；请求失败显示缓存 |
| 网络健康 | Surge 提供的网络类型、IPv4/IPv6、DNS，以及两项 HTTP(S) 连通性耗时 | 5 分钟 | HTTP(S) 探测不是 ICMP Ping；目标和超时通过 Module 参数调整 |
| 四川油价 | 92/95 号汽油、0 号柴油、执行日期和公告来源 | 6 小时 | 不解析不稳定的第三方页面。没有可核对的最新官方四川价格时明确显示“暂无可靠官方数据” |

## 导入与刷新

1. 在 GitHub `cdwbb/Surge` 仓库的 `surge-daily-v1` 分支打开 `Surge/Daily/Daily.sgmodule`，复制 Raw URL。
2. 在 iPhone Surge → **模块** → **安装新模块**，粘贴 URL 并安装/启用。确认 Surge 的 Scripting 已开启。
3. 到 Surge 面板列表中分别点开五张卡片，使用各卡片自己的刷新操作。每张卡片可单独手动刷新；Module 为各卡片设置独立 `update-interval`。
4. 首次打开时脚本从该分支的 GitHub Raw 地址加载。没有网络时天气/空气使用本地持久缓存，节假日表使用上次缓存；油价来自本机 Module 参数，不使用外部缓存。脚本执行完后 Surge 继续显示最后一份面板结果。

## Module 参数

所有可调设置都在 Surge 的 Module 参数界面中修改。参数名按 Surge 规则使用 ASCII 字母、数字和下划线；具体含义如下。

### 城市、刷新与通知参数

| 参数 | 默认值 | 说明 |
| --- | --- | --- |
| `city` | `成都` | 城市显示名 |
| `latitude` / `longitude` | `30.5728` / `104.0668` | Open-Meteo 查询坐标 |
| `timezone` | `Asia/Shanghai` | 城市时区 |
| `forecast_days` | `5` | 天气预报天数，脚本限制为 1–7 天 |
| `weather_refresh` | `1800` | 天气面板刷新秒数 |
| `calendar_refresh` | `21600` | 日历面板刷新秒数 |
| `air_refresh` | `1800` | 空气面板刷新秒数 |
| `network_refresh` | `300` | 网络面板刷新秒数 |
| `oil_refresh` | `21600` | 油价面板刷新秒数 |
| `weather_notify` | `0` | `1` 开启天气 Cron 通知，`0` 关闭 |
| `weather_cold` / `weather_hot` | `5` / `35` | 低温/高温提醒阈值，单位 °C |
| `air_notify` | `0` | `1` 开启空气质量 Cron 通知，`0` 关闭 |
| `air_aqi` | `100` | US AQI 提醒阈值，超过时通知 |
| `oil_notify` | `0` | `1` 开启油价变更 Cron 通知，`0` 关闭 |
| `cron_schedule` | `0 8 * * *` | 三个 Cron 的五段时间表达式，默认每天 08:00 |

### Cron 通知行为

通知由不同 Cron 脚本各自判断和去重；面板刷新不触发通知。

### 网络探测参数

| 参数 | 默认值 | 说明 |
| --- | --- | --- |
| `network_timeout` | `8` | 每个 HTTP(S) 探测的超时秒数 |
| `probe_1_url` | Google 连通性检测 URL | 第一探测目标 |
| `probe_2_url` | Apple 连通性检测 URL | 第二探测目标 |

目标 URL 不要带空格。如果 URL 查询串包含 `&`，在参数值中将其写成 `%26`。

### 官方油价参数

油价默认不显示，因为没有预置未经核实的价格。确认官方公告后才填写以下参数；脚本只接受四川省发改委或国家发改委 HTTPS 域名的公告链接，并要求日期和三个价格都有效。

| 参数 | 默认值 | 说明 |
| --- | --- | --- |
| `oil_date` | `none` | 官方价格执行日期，格式 `YYYY-MM-DD` |
| `oil_92` / `oil_95` / `oil_diesel` | `0` | 92/95 号汽油和 0 号柴油的元/升价格 |
| `oil_source_url` | `none` | 官方公告链接，域名需为 `fgw.sc.gov.cn` 或 `ndrc.gov.cn` |
| `oil_forecast_date` | `none` | 可选的预测调价日期，面板会明确标成预测 |
| `oil_notify` | `0` | 价格及来源有效且配置发生变化时通知 |

### 配置与数据文件
- `config/holidays.json`：逐日节假日、调休工作日、安排状态和农历月首日期。此日期表保留 JSON 管理，不拆成大量 Module 参数。更新新年度时先确认国务院办公厅公告；未公布年份保留 `unconfirmed`。
- `js/*_Panel.js` 与 `js/*_Notify.js`：面板与通知实现严格分离。
- `Daily.sgmodule`：声明所有 Module 参数，并将参数分别传给对应面板和 Cron 脚本。

Surge Module 参数名只使用 ASCII 字母、数字和下划线；默认值和占位符在 `Daily.sgmodule` 中定义。修改参数会保存到当前 Module 实例，不需要编辑 JSON 或推送仓库。[Surge Module 参数表文档](https://manual.nssurge.com/profile/module.html)

### 修改默认城市

在 Surge → 模块 → 成都每日信息中心 → 参数中修改 `city`、`latitude`、`longitude`、`timezone`。天气与空气 API 使用坐标；网络面板不依赖城市。参数保存在本机 Module 实例，不需要改仓库或推送。若 Module 参数被重置，恢复成都默认值即可。

### 更新节假日

编辑 `config/holidays.json` 对应年份的 `holidays`、`workdays`、`status` 和农历数据，记录权威来源链接。节假日和调休上班日期应显式登记；其余日期只按普通工作日/周末判断。未确认的未来年份应标为 `unconfirmed`。

### 更新官方油价

只在拿到可核验的四川省发改委或国家发改委官方公告后，填写 `oil_date`、`oil_92`、`oil_95`、`oil_diesel` 和 `oil_source_url` Module 参数。公告没有公布四川零售价时继续保持默认值，面板显示暂无可靠官方数据。`oil_forecast_date` 仅用于有依据的预测日期，并会标明预测性质。

## 缓存和数据时效

天气、空气、节假日分别使用独立持久化缓存 key；网络缓存最后探测结果以便诊断；通知脚本分别保存去重状态。油价以本机 Module 参数为准，不缓存外部数据，避免清空参数后仍显示旧价格。天气/空气显示 API 返回的时次，日历显示本机刷新时间；从缓存回退时显式标注可能过期。Surge persistent store 仅存字符串，脚本在每次读写处处理 JSON 解析失败。

## 故障排查

- **面板脚本无法加载**：检查 Surge 网络、模块启用状态、脚本 URL 的分支名是否为 `surge-daily-v1`，并确认 `Surge/Daily/js/` 路径大小写。
- **天气/空气为空或缓存旧**：确认 Open-Meteo API 可连通，稍后手动刷新；检查卡片中的数据时次和缓存提示。
- **节假日数据未更新**：检查 GitHub Raw 是否可访问；旧缓存会显示缓存提示。核对 JSON 语法和年份 key。
- **网络探测异常**：HTTP(S) 探测受当前网络、代理策略、目标服务和 TLS 状态影响；异常表示探测失败，不等于 ICMP 丢包。
- **未收到通知**：检查对应 `weather_notify` / `air_notify` / `oil_notify` 是否为 `1`、`cron_schedule` 格式是否有效、系统通知和 Surge 后台刷新设置；天气和 AQI 阈值也在 Module 参数中调整。首个有效油价 Cron 只建立基线。
- **油价显示暂无数据**：这是缺少可靠官方四川价格数据时的预期结果；请不要用第三方抓取值替换官方来源数据。

## 已知限制

- 天气和空气质量依赖 Open-Meteo 服务及模型网格分辨率；不能当作官方观测站或专业预警依据。
- 农历数据随 `holidays.json` 人工逐年更新，目前仅含 2026 年换算表；其他年份明确提示待更新。
- 油价没有可靠、稳定的官方 JSON API，因此不做不稳定网页解析；用户须从官方公告手动填写 Module 参数。
- 面板更新周期是 Surge 面板访问时检查的周期，不保证后台精确到点运行。
- 当前只能做静态检查/脚本模拟；没有 iPhone Surge 6.100.0 真机运行环境，不能宣称完成真机验证。

## 当前核验依据

- Surge [Module 参数表](https://manual.nssurge.com/profile/module.html)、[Information Panel](https://manual.nssurge.com/tools/panel.html)、[Generic Script](https://manual.nssurge.com/scripting/generic.html)、[Cron Script](https://manual.nssurge.com/scripting/cron.html)、[JavaScript API](https://manual.nssurge.com/scripting/api.html)。
- Open-Meteo [Weather Forecast API](https://open-meteo.com/en/docs)、[Air Quality API](https://open-meteo.com/en/docs/air-quality-api)。
- 2026 节假日：[国务院公报通知](https://www.gov.cn/gongbao/2025/issue_12406/material/gwygb202532.pdf)；农历：[香港天文台 2026 对照表](https://www.hko.gov.hk/en/gts/time/calendar/text/files/T2026e.txt)。
- 油价判断：[国家发展改革委 2026-11-12 调价公告](https://www.ndrc.gov.cn/xwdt/xwfb/202611/t20261112_1408795.html)；四川省发改委价格公报用于确认官方数据发布口径。
