(function () {
  var URL = "https://raw.githubusercontent.com/cdwbb/Surge/surge-daily-v1/Surge/Daily/config/settings.json";
  function finish() { $done(); }
  function get(url, cb) { $httpClient.get({ url: url, timeout: 10 }, function (e, r, b) { if (e || !r || r.status < 200 || r.status >= 300) return cb(e || "HTTP error"); try { cb(null, JSON.parse(b)); } catch (x) { cb("JSON error"); } }); }
  if (!/(?:^|&)enabled=1(?:&|$)/.test($argument || "")) return finish();
  get(URL, function (e, cfg) {
    if (e || !cfg) return finish();
    var c = cfg.city || {}, a = cfg.air || {}, key = (cfg.notice || {}).airCacheKey || "cd_daily_air_notice_v1";
    var url = "https://air-quality-api.open-meteo.com/v1/air-quality?latitude=" + encodeURIComponent(c.latitude || 30.5728) + "&longitude=" + encodeURIComponent(c.longitude || 104.0668) + "&current=us_aqi&timezone=" + encodeURIComponent(c.timezone || "Asia/Shanghai");
    get(url, function (err, d) {
      if (err || !d || !d.current || typeof d.current.us_aqi !== "number") return finish();
      var value = d.current.us_aqi, limit = a.notifyUsAqiAbove == null ? 100 : a.notifyUsAqiAbove, state = value > limit ? "above" : "normal", prev = $persistentStore.read(key) || "";
      $persistentStore.write(state, key);
      if (state === "above" && prev !== "above") $notification.post("成都空气质量提醒", "模型 AQI 超过阈值", "US AQI=" + value + "（阈值 " + limit + "）。模型估算，非官方站点实时监测。建议减少户外剧烈活动。");
      finish();
    });
  });
}());
