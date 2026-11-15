(function () {
  var URL = "https://raw.githubusercontent.com/cdwbb/Surge/surge-daily-v1/Surge/Daily/config/settings.json";
  function finish() { $done(); }
  function get(url, cb) { $httpClient.get({ url: url, timeout: 10 }, function (e, r, b) { if (e || !r || r.status < 200 || r.status >= 300) return cb(e || "HTTP error"); try { cb(null, JSON.parse(b)); } catch (x) { cb("JSON error"); } }); }
  var enabled = /(?:^|&)enabled=1(?:&|$)/.test($argument || "");
  if (!enabled) return finish();
  get(URL, function (e, cfg) {
    if (e || !cfg) return finish();
    var c = cfg.city || {}, w = cfg.weather || {}, key = (cfg.notice || {}).weatherCacheKey || "cd_daily_weather_notice_v1";
    var url = "https://api.open-meteo.com/v1/forecast?latitude=" + encodeURIComponent(c.latitude || 30.5728) + "&longitude=" + encodeURIComponent(c.longitude || 104.0668) + "&current=temperature_2m,weather_code&timezone=" + encodeURIComponent(c.timezone || "Asia/Shanghai");
    get(url, function (err, data) {
      if (err || !data || !data.current || typeof data.current.temperature_2m !== "number") return finish();
      var t = data.current.temperature_2m, state = t <= (w.notifyColdCelsius == null ? 5 : w.notifyColdCelsius) ? "cold" : (t >= (w.notifyHotCelsius == null ? 35 : w.notifyHotCelsius) ? "hot" : "normal");
      var previous = $persistentStore.read(key) || "";
      $persistentStore.write(state, key);
      if ((state === "cold" || state === "hot") && state !== previous) {
        $notification.post("成都天气提醒", state === "cold" ? "低温提醒" : "高温提醒", "当前 " + t.toFixed(1) + "°C；阈值：低于 " + (w.notifyColdCelsius == null ? 5 : w.notifyColdCelsius) + "°C / 高于 " + (w.notifyHotCelsius == null ? 35 : w.notifyHotCelsius) + "°C。来源：Open-Meteo 模型。");
      }
      finish();
    });
  });
}());
