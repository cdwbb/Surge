(function () {
  var DEFAULT = { city: { name: "成都", latitude: 30.5728, longitude: 104.0668, timezone: "Asia/Shanghai" }, air: { cacheKey: "cd_daily_air_v1" } };
  function args() { var out = {}, pairs = String($argument || "").split("&"); for (var i = 0; i < pairs.length; i++) { var at = pairs[i].indexOf("="); if (at < 0) continue; var value = pairs[i].slice(at + 1); try { value = decodeURIComponent(value); } catch (ignore) {} out[pairs[i].slice(0, at)] = value; } return out; }
  function numberArg(a, key, fallback) { var n = Number(a[key]); return isFinite(n) && a[key] !== "" ? n : fallback; }
  function done(title, content, style, icon) { var result = { title: title, content: content }; if (icon) { result.icon = icon; result["icon-color"] = "#39A86B"; } else result.style = style || "info"; $done(result); }
  function json(url, cb) { $httpClient.get({ url: url, timeout: 10, headers: { "Accept": "application/json" } }, function (e, r, b) { if (e || !r || r.status < 200 || r.status >= 300) return cb(e || "HTTP " + (r ? r.status : "无响应")); try { cb(null, JSON.parse(b)); } catch (x) { cb("JSON 解析失败"); } }); }
  function category(n) { if (n <= 50) return ["优", "green"]; if (n <= 100) return ["良", "green"]; if (n <= 150) return ["对敏感人群不健康", "warning"]; if (n <= 200) return ["不健康", "warning"]; if (n <= 300) return ["非常不健康", "warning"]; return ["危险", "warning"]; }
  function render(a) {
    var c = { name: a.city || DEFAULT.city.name, latitude: numberArg(a, "latitude", DEFAULT.city.latitude), longitude: numberArg(a, "longitude", DEFAULT.city.longitude), timezone: a.timezone || DEFAULT.city.timezone };
    var url = "https://air-quality-api.open-meteo.com/v1/air-quality?latitude=" + encodeURIComponent(c.latitude) + "&longitude=" + encodeURIComponent(c.longitude) + "&current=us_aqi,pm2_5,pm10&timezone=" + encodeURIComponent(c.timezone || "Asia/Shanghai");
    json(url, function (err, d) {
      var key = DEFAULT.air.cacheKey;
      if (err || !d || !d.current) {
        var cached = $persistentStore.read(key);
        if (cached) { try { var old = JSON.parse(cached); done("成都空气质量 · 缓存", old.content + "\n⚠️ 请求失败，显示缓存数据（可能过期）", "error"); return; } catch (ignore) {} }
        done("成都空气质量 · 暂不可用", "空气质量数据获取失败：" + (err || "返回数据不完整") + "\n来源：Open-Meteo Air Quality API", "error"); return;
      }
      var v = d.current, grade = category(Number(v.us_aqi)), time = String(v.time || "未知").replace("T", " ");
      var content = "US AQI（模型估算）：" + v.us_aqi + " · " + grade[0] + "\nPM2.5：" + v.pm2_5 + " μg/m³\nPM10：" + v.pm10 + " μg/m³\n数据时次：" + time + "（Asia/Shanghai）\n来源：Open-Meteo Air Quality API，约 11 km 网格模型预报。\n数据性质：模型估算，非中国官方监测站实时值。\n健康提示：" + (v.us_aqi <= 50 ? "空气质量理想。" : v.us_aqi <= 100 ? "一般人群可正常活动；敏感人群留意身体反应。" : "减少长时间或剧烈户外活动，敏感人群加强防护。");
      $persistentStore.write(JSON.stringify({ content: content, savedAt: Date.now() }), key);
      done(c.name + "空气质量", content, "info", "aqi.medium");
    });
  }
  render(args());
}());
