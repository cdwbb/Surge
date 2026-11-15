(function () {
  function finish() { $done(); }
  var enabled = /(?:^|&)enabled=1(?:&|$)/.test($argument || "");
  if (!enabled) return finish();
  var url = "https://raw.githubusercontent.com/cdwbb/Surge/surge-daily-v1/Surge/Daily/config/settings.json";
  $httpClient.get({ url: url, timeout: 8, headers: { "Accept": "application/json" } }, function (err, resp, body) {
    if (err || !resp || resp.status < 200 || resp.status >= 300) return finish();
    try {
      var cfg = JSON.parse(body), oil = cfg.oil || {};
      if (oil.status !== "official" || !oil.prices || !oil.effectiveDate || !oil.sourceUrl) return finish();
      var signature = JSON.stringify({ effectiveDate: oil.effectiveDate, prices: oil.prices, sourceUrl: oil.sourceUrl });
      var key = (cfg.notice || {}).oilCacheKey || "cd_daily_oil_notice_v1", previous = $persistentStore.read(key) || "";
      $persistentStore.write(signature, key);
      if (previous && previous !== signature) $notification.post("四川油价更新", "官方价格数据已变更", "执行日期 " + oil.effectiveDate + "。请查看四川油价面板。来源：" + oil.sourceName + "。");
    } catch (ignore) {}
    finish();
  });
}());
