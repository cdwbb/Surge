(function () {
  var URL = "https://raw.githubusercontent.com/cdwbb/Surge/surge-daily-v1/Surge/Daily/config/settings.json";
  function show(cfg, stale) {
    var o = cfg.oil || {}, lines = [];
    if (o.status === "official" && o.prices && o.effectiveDate) {
      lines.push("执行日期：" + o.effectiveDate);
      lines.push("92号汽油：" + (o.prices.gasoline92 == null ? "—" : "¥" + o.prices.gasoline92 + "/L"));
      lines.push("95号汽油：" + (o.prices.gasoline95 == null ? "—" : "¥" + o.prices.gasoline95 + "/L"));
      lines.push("0号柴油：" + (o.prices.diesel0 == null ? "—" : "¥" + o.prices.diesel0 + "/L"));
      lines.push("数据来源：" + (o.sourceName || "官方公告"));
      if (o.sourceUrl) lines.push("公告：" + o.sourceUrl);
      if (o.forecastDate) lines.push("预计调价日期（预测）：" + o.forecastDate);
      if (stale) lines.push("⚠️ 配置文件获取失败，显示上次缓存；请核对公告。");
      $done({ title: "四川油价", content: lines.join("\n"), icon: "fuelpump.fill", "icon-color": "#F5A623" }); return;
    }
    lines.push("暂无可靠官方数据");
    lines.push("本面板不显示第三方页面抓取或过期价格。");
    lines.push("数据来源：四川省发展改革委 / 国家发展改革委");
    lines.push("上次检查：" + new Date().toLocaleString());
    lines.push("如需补录价格，请在 settings.json 中填写官方公告价格、执行日期及公告链接。");
    if (stale) lines.push("⚠️ 当前无法连接配置源。");
    $done({ title: "四川油价", content: lines.join("\n"), icon: "fuelpump.fill", "icon-color": "#F5A623" });
  }
  $httpClient.get({ url: URL, timeout: 8, headers: { "Accept": "application/json" } }, function (e, r, b) {
    if (!e && r && r.status >= 200 && r.status < 300) { try { var cfg = JSON.parse(b); $persistentStore.write(JSON.stringify(cfg.oil || {}), "cd_daily_oil_v1"); show(cfg, false); return; } catch (ignore) {} }
    var saved = $persistentStore.read("cd_daily_oil_v1");
    if (saved) { try { show({ oil: JSON.parse(saved) }, true); return; } catch (ignore2) {} }
    show({ oil: { status: "unavailable" } }, true);
  });
}());
