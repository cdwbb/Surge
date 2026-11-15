(function () {
  var HOLIDAY_URL = "https://raw.githubusercontent.com/cdwbb/Surge/surge-daily-v1/Surge/Daily/config/holidays.json";
  var KEY = "cd_daily_holidays_v1";
  var monthNames = ["", "正月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "冬月", "腊月"];
  var dayNames = ["", "初一", "初二", "初三", "初四", "初五", "初六", "初七", "初八", "初九", "初十", "十一", "十二", "十三", "十四", "十五", "十六", "十七", "十八", "十九", "二十", "廿一", "廿二", "廿三", "廿四", "廿五", "廿六", "廿七", "廿八", "廿九", "三十"];
  function dateKey(d) { return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
  function lunarText(date, yearData) {
    var starts = yearData.lunarMonthStarts || {}, best = null, bestMonth = 0;
    for (var k in starts) if (starts.hasOwnProperty(k) && k <= date) { if (!best || k > best) { best = k; bestMonth = starts[k]; } }
    if (!best) return "农历日期待更新（本地仅维护 2026 年换算表）";
    var lunarDay = Math.floor((new Date(date + "T12:00:00").getTime() - new Date(best + "T12:00:00").getTime()) / 86400000) + 1, month = bestMonth;
    if (lunarDay > 30) return "农历日期待更新";
    return monthNames[month] + dayNames[lunarDay];
  }
  function show(data, stale) {
    var now = new Date(), key = dateKey(now), year = data.years && data.years[String(now.getFullYear())], lines = [];
    var week = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
    lines.push(key + "  " + week[now.getDay()]);
    if (year) {
      lines.push(lunarText(key, year));
      if (year.holidays && year.holidays[key]) lines.push("🟥 " + year.holidays[key] + " · 放假");
      else if (year.workdays && year.workdays[key]) lines.push("🟦 " + year.workdays[key] + " · 工作日");
      else if (year.status === "unconfirmed" && (now.getDay() === 0 || now.getDay() === 6)) lines.push("⬜ 周末；年度调休安排待确认");
      else if (year.status === "unconfirmed") lines.push("🟩 普通工作日（年度调休安排待确认）");
      else if (now.getDay() === 0 || now.getDay() === 6) lines.push("⬜ 周末休息（非节假日）");
      else lines.push("🟩 工作日");
      lines.push("安排状态：" + (year.statusLabel || (year.status === "unconfirmed" ? "待确认" : "已登记")));
    } else {
      lines.push("节假日数据尚未覆盖该年份；周末仅按星期显示，不推断法定假期。");
    }
    lines.push("节假日/调休来源：本地 holidays.json（国务院办公厅公告）");
    lines.push("农历来源：香港天文台 2026 公历与农历对照表");
    lines.push("刷新时间：" + now.toLocaleString());
    if (stale) lines.push("⚠️ 节假日文件暂不可更新，使用本地缓存。");
    $done({ title: "日期与节假日", content: lines.join("\n"), icon: "calendar", "icon-color": "#3478F6" });
  }
  $httpClient.get({ url: HOLIDAY_URL, timeout: 8, headers: { "Accept": "application/json" } }, function (err, resp, body) {
    if (!err && resp && resp.status >= 200 && resp.status < 300) {
      try { var parsed = JSON.parse(body); $persistentStore.write(JSON.stringify(parsed), KEY); show(parsed, false); return; } catch (ignore) {}
    }
    var saved = $persistentStore.read(KEY);
    if (saved) { try { show(JSON.parse(saved), true); return; } catch (ignore2) {} }
    $done({ title: "日期与节假日", content: "无法加载本地节假日文件，且没有缓存。\n请检查网络后刷新。", style: "error" });
  });
}());
