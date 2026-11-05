# Surge

自用 Surge 模块 / 脚本 / 规则。全部可直接用 URL 导入。

## 高德地图去广告

开屏、首页卡片与图层、搜索（热词 / 联想 / 结果列表）、附近页、我的页面、路线规划、导航内插播广告、酒店与门票页、打车页资源位的推广清理。

- 模块（导入这一个即可，脚本由模块自动下载缓存）：
  https://raw.githubusercontent.com/cdwbb/Surge/main/amap_remove_ads.sgmodule
- 脚本：
  https://raw.githubusercontent.com/cdwbb/Surge/main/js/amap_remove_ads.js
- jsDelivr 镜像（GitHub 拉不到时，把模块里 10 条 script-path 换成这个）：
  https://cdn.jsdelivr.net/gh/cdwbb/Surge@main/js/amap_remove_ads.js

前置条件：Surge 打开 MITM 主开关并信任 CA、打开 Rewrite 与 Scripting 开关。模块只能追加 MITM hostname，不能替你装证书或开总开关。

### 参数开关

装好后在 Surge →「模块」→ 高德地图去广告 → 参数里改，`1` 开 `0` 关，自动生效，不用碰代码。

| 参数 | 默认 | 作用 |
| --- | --- | --- |
| `splash` | 1 | 开屏广告 |
| `home` | 1 | 首页卡片、资源位、图层配置中心 |
| `search` | 1 | 搜索热词、联想词、搜索结果列表推广 |
| `nearby` | 1 | 附近页推荐流 |
| `route` | 1 | 路线规划、导航中插播广告、导航结束页 |
| `taxi` | 1 | 打车页资源位、评价气泡、红点角标 |
| `poi` | 1 | 地点详情页推广、优惠券、酒店门票页 |
| `profile` | 1 | 我的页面卡片 |
| `banner` | 1 | 横幅、AI 推荐、消息盒推广 |
| `tools` | 1 | 工具宫格、转化列表 |
| `mock` | 1 | 纯广告接口在请求阶段直接拦截；关掉整类放行 |
| `strict` | 1 | 通用递归清洗（更彻底，也更激进） |
| `poi_strict` | 0 | 地点详情页按白名单裁剪，激进，按需开 |
| `log` | 0 | 在 Surge 请求备注里输出去广告日志，排障用 |

只想离线用（不联网拉脚本）：改用本地脚本版模块，把 sgmodule 与 js 一起放进 Profile（配置文件）所在目录，`script-path` 相对路径的解析基准就是 Profile 目录。

## 其他

- 限行查询
  https://raw.githubusercontent.com/cdwbb/Surge/main/xianxing.sgmodule
  https://raw.githubusercontent.com/cdwbb/Surge/main/js/xianxing.js
