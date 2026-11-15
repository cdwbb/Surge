(function () {
  function finish() { $done(); }
  function args() { var out = {}, pairs = String($argument || "").split("&"); for (var i = 0; i < pairs.length; i++) { var at = pairs[i].indexOf("="); if (at < 0) continue; var value = pairs[i].slice(at + 1); try { value = decodeURIComponent(value); } catch (ignore) {} out[pairs[i].slice(0, at)] = value; } return out; }
  function numberArg(a, key, fallback) { var n = Number(a[key]); return isFinite(n) && a[key] !== "" ? n : fallback; }
  var a = args(), enabled = a.enabled === "1";
  if (!enabled) return finish();
  var cold = numberArg(a, "weather_cold", 5), hot = numberArg(a, "weather_hot", 35);
  var url = "https://api.open-meteo.com/v1/forecast?latitude=" + encodeURIComponent(numberArg(a, "latitude", 30.5728)) + "&longitude=" + encodeURIComponent(numberArg(a, "longitude", 104.0668)) + "&current=temperature_2m,weather_code&timezone=" + encodeURIComponent(a.timezone || "Asia/Shanghai");
  $httpClient.get({ url: url, timeout: 10 }, function (err, response, body) {
      var data;
      if (!err && response && response.status >= 200 && response.status < 300) { try { data = JSON.parse(body); } catch (ignore2) {} }
      if (err || !data || !data.current || typeof data.current.temperature_2m !== "number") return finish();
      var t = data.current.temperature_2m, state = t <= cold ? "cold" : (t >= hot ? "hot" : "normal");
      var previous = $persistentStore.read("cd_daily_weather_notice_v1") || "";
      $persistentStore.write(state, "cd_daily_weather_notice_v1");
      if ((state === "cold" || state === "hot") && state !== previous) {
        $notification.post((a.city || "成都") + "天气提醒", state === "cold" ? "低温提醒" : "高温提醒", "当前 " + t.toFixed(1) + "°C；阈值：低于 " + cold + "°C / 高于 " + hot + "°C。来源：Open-Meteo 模型。");
      }
      finish();
  });
}());
