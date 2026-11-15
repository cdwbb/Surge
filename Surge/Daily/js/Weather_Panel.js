(function () {
  var DEFAULTS = { city: { name: "成都", latitude: 30.5728, longitude: 104.0668, timezone: "Asia/Shanghai" }, weather: { forecastDays: 5, cacheKey: "cd_daily_weather_v1" } };
  function args() { var out = {}, pairs = String($argument || "").split("&"); for (var i = 0; i < pairs.length; i++) { var at = pairs[i].indexOf("="); if (at < 0) continue; var key = pairs[i].slice(0, at), value = pairs[i].slice(at + 1); try { value = decodeURIComponent(value); } catch (ignore) {} out[key] = value; } return out; }
  function numberArg(a, key, fallback) { var n = Number(a[key]); return isFinite(n) && a[key] !== "" ? n : fallback; }
  function done(title, content, style, icon) { var result = { title: title, content: content }; if (icon) { result.icon = icon; result["icon-color"] = "#F5A623"; } else result.style = style || "info"; $done(result); }
  function getJSON(url, callback) {
    $httpClient.get({ url: url, timeout: 10, headers: { "Accept": "application/json" } }, function (err, resp, body) {
      if (err || !resp || resp.status < 200 || resp.status >= 300) return callback(err || "HTTP " + (resp ? resp.status : "无响应"));
      try { callback(null, JSON.parse(body)); } catch (e) { callback("JSON 解析失败"); }
    });
  }
  function weatherText(code) {
    var m = { 0: ["晴", "sun.max.fill"], 1: ["大部晴朗", "sun.max.fill"], 2: ["局部多云", "cloud.sun.fill"], 3: ["阴", "cloud.fill"], 45: ["有雾", "cloud.fog.fill"], 48: ["雾凇", "cloud.fog.fill"], 51: ["毛毛雨", "cloud.drizzle.fill"], 53: ["小雨", "cloud.drizzle.fill"], 55: ["中雨", "cloud.drizzle.fill"], 56: ["冻毛毛雨", "cloud.sleet.fill"], 57: ["强冻毛毛雨", "cloud.sleet.fill"], 61: ["小雨", "cloud.rain.fill"], 63: ["中雨", "cloud.rain.fill"], 65: ["大雨", "cloud.heavyrain.fill"], 66: ["冻雨", "cloud.sleet.fill"], 67: ["强冻雨", "cloud.sleet.fill"], 71: ["小雪", "cloud.snow.fill"], 73: ["中雪", "cloud.snow.fill"], 75: ["大雪", "snowflake"], 77: ["雪粒", "cloud.snow.fill"], 80: ["阵雨", "cloud.rain.fill"], 81: ["强阵雨", "cloud.heavyrain.fill"], 82: ["暴雨", "cloud.heavyrain.fill"], 85: ["阵雪", "cloud.snow.fill"], 86: ["强阵雪", "cloud.snow.fill"], 95: ["雷暴", "cloud.bolt.rain.fill"], 96: ["雷暴伴冰雹", "cloud.hail.fill"], 99: ["强雷暴伴冰雹", "cloud.hail.fill"] };
    return m[code] || ["天气状况未知", "cloud.fill"];
  }
  function render(a) {
    var c = { name: a.city || DEFAULTS.city.name, latitude: numberArg(a, "latitude", DEFAULTS.city.latitude), longitude: numberArg(a, "longitude", DEFAULTS.city.longitude), timezone: a.timezone || DEFAULTS.city.timezone };
    var forecastDays = Math.max(1, Math.min(7, Math.floor(numberArg(a, "forecast_days", DEFAULTS.weather.forecastDays))));
    var url = "https://api.open-meteo.com/v1/forecast?latitude=" + encodeURIComponent(c.latitude) + "&longitude=" + encodeURIComponent(c.longitude) + "&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&forecast_days=" + encodeURIComponent(forecastDays) + "&timezone=" + encodeURIComponent(c.timezone || "Asia/Shanghai");
    getJSON(url, function (err, d) {
      var key = DEFAULTS.weather.cacheKey;
      if (err || !d || !d.current || !d.daily) {
        var cached = $persistentStore.read(key);
        if (cached) {
          try { var old = JSON.parse(cached); done("成都天气 · 缓存", old.content + "\n⚠️ 网络请求失败，以下为缓存数据（可能不是最新）", "error"); return; } catch (ignore) {}
        }
        done("成都天气 · 暂不可用", "天气数据获取失败：" + (err || "返回数据不完整") + "\n请稍后刷新。\n来源：Open-Meteo", "error"); return;
      }
      var now = d.current, today = weatherText(now.weather_code), lines = [];
      lines.push(today[0] + "  ·  " + Math.round(now.temperature_2m) + "°C（体感 " + Math.round(now.apparent_temperature) + "°C）");
      lines.push("湿度 " + now.relative_humidity_2m + "%  ·  风速 " + now.wind_speed_10m + " km/h");
      lines.push("今日 " + d.daily.time[0] + " 最高 " + Math.round(d.daily.temperature_2m_max[0]) + "° / 最低 " + Math.round(d.daily.temperature_2m_min[0]) + "°");
      lines.push("未来预报");
      for (var i = 1; i < d.daily.time.length; i++) lines.push(d.daily.time[i].slice(5) + "  " + weatherText(d.daily.weather_code[i])[0] + "  " + Math.round(d.daily.temperature_2m_min[i]) + "° ~ " + Math.round(d.daily.temperature_2m_max[i]) + "°");
      var updated = now.time ? now.time.replace("T", " ") : "未知";
      lines.push("数据时次：" + updated + "（" + c.timezone + "）");
      lines.push("来源：Open-Meteo 天气模型数据；非成都气象台站点实测。");
      var content = lines.join("\n");
      $persistentStore.write(JSON.stringify({ content: content, savedAt: Date.now() }), key);
      done(c.name + "天气", content, "info", today[1]);
    });
  }
  render(args());
}());
