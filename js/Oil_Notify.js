(function () {
  function finish() { $done(); }
  function args() { var out = {}, pairs = String($argument || "").split("&"); for (var i = 0; i < pairs.length; i++) { var at = pairs[i].indexOf("="); if (at < 0) continue; var value = pairs[i].slice(at + 1); try { value = decodeURIComponent(value); } catch (ignore) {} out[pairs[i].slice(0, at)] = value; } return out; }
  function price(a, key) { var n = Number(a[key]); return isFinite(n) && n > 0 && n < 30 ? n : null; }
  function validDate(value) { if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false; var p = value.split("-"), d = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]))); return d.getUTCFullYear() === Number(p[0]) && d.getUTCMonth() === Number(p[1]) - 1 && d.getUTCDate() === Number(p[2]); }
  function officialSource(url) { return /^https:\/\/(?:fgw\.sc\.gov\.cn|(?:[a-z0-9-]+\.)*ndrc\.gov\.cn)(?:[/:?#]|$)/i.test(url || ""); }
  var a = args();
  if (a.enabled !== "1") return finish();
  var sourceUrl = a.oil_source_url === "none" ? "" : (a.oil_source_url || "");
  var p92 = price(a, "oil_92"), p95 = price(a, "oil_95"), diesel = price(a, "oil_diesel");
  if (!validDate(a.oil_date) || !p92 || !p95 || !diesel || !officialSource(sourceUrl)) return finish();
  var signature = JSON.stringify({ effectiveDate: a.oil_date, gasoline92: p92, gasoline95: p95, diesel0: diesel, sourceUrl: sourceUrl });
  var key = "cd_daily_oil_notice_v1", previous = $persistentStore.read(key) || "";
  $persistentStore.write(signature, key);
  if (previous && previous !== signature) $notification.post("四川油价更新", "Module 参数中的官方价格数据已变更", "执行日期 " + a.oil_date + "。请查看四川油价面板。来源：官方公告链接。");
  finish();
}());
