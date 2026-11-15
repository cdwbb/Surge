(function () {
  function finish() { $done(); }
  function args() { var out = {}, pairs = String($argument || "").split("&"); for (var i = 0; i < pairs.length; i++) { var at = pairs[i].indexOf("="); if (at < 0) continue; var value = pairs[i].slice(at + 1); try { value = decodeURIComponent(value); } catch (ignore) {} out[pairs[i].slice(0, at)] = value; } return out; }
  function numberArg(a, key, fallback) { var n = Number(a[key]); return isFinite(n) && a[key] !== "" ? n : fallback; }
  var a = args();
  if (a.enabled !== "1") return finish();
    var limit = numberArg(a, "air_aqi", 100);
    var url = "https://air-quality-api.open-meteo.com/v1/air-quality?latitude=" + encodeURIComponent(numberArg(a, "latitude", 30.5728)) + "&longitude=" + encodeURIComponent(numberArg(a, "longitude", 104.0668)) + "&current=us_aqi&timezone=" + encodeURIComponent(a.timezone || "Asia/Shanghai");
    $httpClient.get({ url: url, timeout: 10 }, function (err, response, body) {
      var d;
      if (!err && response && response.status >= 200 && response.status < 300) { try { d = JSON.parse(body); } catch (ignore2) {} }
      if (err || !d || !d.current || typeof d.current.us_aqi !== "number") return finish();
      var value = d.current.us_aqi, state = value > limit ? "above" : "normal", key = "cd_daily_air_notice_v1", prev = $persistentStore.read(key) || "";
      $persistentStore.write(state, key);
      if (state === "above" && prev !== "above") $notification.post((a.city || "成都") + "空气质量提醒", "模型 AQI 超过阈值", "US AQI=" + value + "（阈值 " + limit + "）。模型估算，非官方站点实时监测。建议减少户外剧烈活动。");
      finish();
    });
}());
