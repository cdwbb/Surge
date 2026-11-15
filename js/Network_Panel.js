(function () {
  var DEFAULT = { timeout: 8, targets: [{ name: "目标 1", url: "https://connectivitycheck.gstatic.com/generate_204" }, { name: "目标 2", url: "https://www.apple.com/library/test/success.html" }] };
  function args() { var out = {}, pairs = String($argument || "").split("&"); for (var i = 0; i < pairs.length; i++) { var at = pairs[i].indexOf("="); if (at < 0) continue; var value = pairs[i].slice(at + 1); try { value = decodeURIComponent(value); } catch (ignore) {} out[pairs[i].slice(0, at)] = value; } return out; }
  function numberArg(a, key, fallback) { var n = Number(a[key]); return isFinite(n) && a[key] !== "" ? n : fallback; }
  function val(v) { return v ? String(v) : "不可用"; }
  function run(a) {
    var n = $network || {}, wifi = n.wifi || {}, v4 = n.v4 || {}, v6 = n.v6 || {}, cell = n["cellular-data"] || {}, dns = n.dns || [];
    var iface = String(v4.primaryInterface || v6.primaryInterface || "");
    var type = wifi.ssid ? "Wi-Fi（" + wifi.ssid + "）" : (cell.carrier ? "蜂窝网络（" + cell.carrier + (cell.radio ? " / " + cell.radio : "") + "）" : (/en|wifi/i.test(iface) ? "Wi-Fi（网络接口 " + iface + "）" : (/pdp|wwan|cell/i.test(iface) ? "蜂窝网络（网络接口 " + iface + "）" : "网络类型无法判定")));
    var lines = ["网络类型：" + type, "IPv4：" + val(v4.primaryAddress), "IPv6：" + val(v6.primaryAddress), "DNS：" + (dns.length ? dns.join("、") : "不可用"), "HTTP(S) 连通性探测（不是 ICMP Ping）："];
    var targets = [
      { name: DEFAULT.targets[0].name, url: a.probe_1_url || DEFAULT.targets[0].url },
      { name: DEFAULT.targets[1].name, url: a.probe_2_url || DEFAULT.targets[1].url }
    ];
    var timeout = Math.max(1, Math.min(60, numberArg(a, "network_timeout", DEFAULT.timeout))), pending = targets.length;
    if (!pending) { lines.push("未配置探测目标。"); return finish(lines); }
    for (var j = 0; j < targets.length; j++) lines.push("探测中…");
    function complete() { pending--; if (pending === 0) finish(lines); }
    for (var i = 0; i < targets.length; i++) (function (target, index) {
      var started = Date.now();
      $httpClient.get({ url: target.url, timeout: timeout }, function (err, resp) {
        var ms = Date.now() - started;
        lines[index + 5] = (err || !resp ? "❌ 异常" : (resp.status >= 200 && resp.status < 400 ? "✅ HTTP " + resp.status : "⚠️ HTTP " + resp.status)) + " · " + target.name + " · " + ms + " ms";
        complete();
      });
    }(targets[i], i));
  }
  function finish(lines) {
    var key = "cd_daily_network_v1";
    var cache = $persistentStore.read(key);
    var hasSuccess = false;
    for (var i = 0; i < lines.length; i++) if (String(lines[i]).indexOf("✅ HTTP ") >= 0) hasSuccess = true;
    if (!hasSuccess && cache) {
      try {
        var previous = JSON.parse(cache);
        lines.push("上次面板结果缓存于：" + new Date(previous.savedAt).toLocaleString());
      } catch (ignore) {}
    }
    lines.push("来源：Surge $network 本机环境信息；探测目标由 Module 参数指定。");
    lines.push("采集时间：" + new Date().toLocaleString());
    var content = lines.join("\n");
    $persistentStore.write(JSON.stringify({ content: content, savedAt: Date.now() }), key);
    $done({ title: "网络健康", content: content, icon: "network", "icon-color": "#3478F6" });
  }
  run(args());
}());
