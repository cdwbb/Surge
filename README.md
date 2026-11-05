# Surge

自用 Surge 模块 / 脚本 / 规则。全部可直接用 URL 导入。

## 高德地图去广告

开屏、首页卡片、搜索（含热词/联想词/搜索结果推广）、附近页、我的页面、路线规划、导航插话广告、水电费与酒店页、打车页资源位的推广清理。

- 模块（导入这一个即可，脚本由模块自动下载缓存）：
  https://raw.githubusercontent.com/cdwbb/Surge/main/amap_remove_ads.sgmodule
- 脚本：
  https://raw.githubusercontent.com/cdwbb/Surge/main/js/amap_remove_ads.js
- jsDelivr 镜像（GitHub 拉不到时，把模块里 10 条 script-path 换成这个）：
  https://cdn.jsdelivr.net/gh/cdwbb/Surge@main/js/amap_remove_ads.js

前置条件：Surge 打开 MITM 主开关并信任 CA、打开 Rewrite 与 Scripting 开关。模块只能追加 MITM hostname，不能替你装证书或开总开关。

只想离线用（不联网拉脚本）：改用本地脚本版模块，把 sgmodule 与 js 一起放进 Profile（配置文件）所在目录，`script-path` 相对路径的解析基准就是 Profile 目录。

## 其他

- 限行查询
  https://raw.githubusercontent.com/cdwbb/Surge/main/xianxing.sgmodule
  https://raw.githubusercontent.com/cdwbb/Surge/main/js/xianxing.js
