(function () {
  function args() { var out = {}, pairs = String($argument || "").split("&"); for (var i = 0; i < pairs.length; i++) { var at = pairs[i].indexOf("="); if (at < 0) continue; var value = pairs[i].slice(at + 1); try { value = decodeURIComponent(value); } catch (ignore) {} out[pairs[i].slice(0, at)] = value; } return out; }
  function price(a, key) { var n = Number(a[key]); return isFinite(n) && n > 0 && n < 30 ? n : null; }
  function validDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
    var parts = value.split("-"), date = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
    return date.getUTCFullYear() === Number(parts[0]) && date.getUTCMonth() === Number(parts[1]) - 1 && date.getUTCDate() === Number(parts[2]);
  }
  function officialSource(url) { return /^https:\/\/(?:fgw\.sc\.gov\.cn|(?:[a-z0-9-]+\.)*ndrc\.gov\.cn)(?:[/:?#]|$)/i.test(url || ""); }
  var a = args(), prices = { gasoline92: price(a, "oil_92"), gasoline95: price(a, "oil_95"), diesel0: price(a, "oil_diesel") };
  var sourceUrl = a.oil_source_url === "none" ? "" : (a.oil_source_url || "");
  var complete = validDate(a.oil_date) && prices.gasoline92 && prices.gasoline95 && prices.diesel0 && officialSource(sourceUrl);
  if (!complete) {
    $done({ title: "四川油价", content: "暂无可靠官方数据\n仅填写可核验的官方公告数据后显示价格。\nModule 参数需包含执行日期、92/95 号汽油、0 号柴油及四川省发改委或国家发改委公告链接。\n查询时间：" + new Date().toLocaleString(), icon: "fuelpump.fill", "icon-color": "#F5A623" });
    return;
  }
  var lines = ["执行日期：" + a.oil_date, "92号汽油：¥" + prices.gasoline92.toFixed(2) + "/L", "95号汽油：¥" + prices.gasoline95.toFixed(2) + "/L", "0号柴油：¥" + prices.diesel0.toFixed(2) + "/L", "数据来源：四川省发展改革委 / 国家发展改革委官方公告", "公告链接：" + sourceUrl, "参数读取时间：" + new Date().toLocaleString()];
  if (validDate(a.oil_forecast_date) && a.oil_forecast_date !== "none") lines.push("预计调价日期（预测，非官方确认）：" + a.oil_forecast_date);
  $done({ title: "四川油价", content: lines.join("\n"), icon: "fuelpump.fill", "icon-color": "#F5A623" });
}());
