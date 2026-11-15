/*
 * Surge 成都车辆限行查询 - 成都市公安局官方规则版
 * 抓取成都市公安局官方通告中的常态限行规则，再按星期计算今日和明日尾号。
 * 临时交通管制、法定节假日及调休安排可能改变常态规则，请以最新官方通告为准。
 */
(function () {
  "use strict";

  var OFFICIAL_URL = "https://cdgaj.chengdu.gov.cn/cdsgaj/jfts/2025-01/19/content_a78dfcd586d64dfcbc9c7bdf4060c158.shtml";
  var DEFAULTS = { city: "cd", loo: "本地车", cartype: "燃油车", mode: "panel" };

  function parseArgs(raw) {
    var out = {};
    if (raw && typeof raw === "object") out = raw;
    else if (typeof raw === "string") raw.split("&").forEach(function (part) {
      var i = part.indexOf("="), key = i < 0 ? part : part.slice(0, i), value = i < 0 ? "" : part.slice(i + 1);
      try { out[decodeURIComponent(key.replace(/\+/g, " "))] = decodeURIComponent(value.replace(/\+/g, " ")); }
      catch (_) { out[key] = value; }
    });
    Object.keys(DEFAULTS).forEach(function (key) { if (out[key] === undefined || out[key] === "") out[key] = DEFAULTS[key]; });
    return out;
  }

  function decodeHtml(text) {
    var named = { "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&ldquo;": "“", "&rdquo;": "”", "&mdash;": "—", "&hellip;": "…" };
    text = text.replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;|&ldquo;|&rdquo;|&mdash;|&hellip;/gi, function (m) { return named[m.toLowerCase()] || m; });
    text = text.replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(parseInt(n, 10)); });
    return text.replace(/&#x([0-9a-f]+);/gi, function (_, n) { return String.fromCharCode(parseInt(n, 16)); });
  }

  function htmlToText(html) {
    return decodeHtml(String(html || "")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<(br|hr)\b[^>]*>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6]|section|article|tr|td|th|ul|ol)>/gi, "\n")
      .replace(/<[^>]+>/g, " "))
      .replace(/[\t\r ]+/g, " ").replace(/\n\s*/g, "\n").replace(/\n{2,}/g, "\n").trim();
  }

  function extractOfficialRules(html) {
    var text = htmlToText(html);
    if (!/成都市公安局/.test(text) || !/尾号限行/.test(text)) {
      var title = (String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "";
      throw new Error("未能确认取得成都市公安局限行通告。页面标题：" + htmlToText(title).slice(0, 100));
    }
    var days = ["星期一", "星期二", "星期三", "星期四", "星期五"];
    var tails = {};
    days.forEach(function (day, index) {
      var pattern = day + "为[“‘\\\"]?(\\d)[”’\\\"]?\\s*(?:和|、|与)\\s*[“‘\\\"]?(\\d)";
      var match = text.match(new RegExp(pattern));
      if (!match) throw new Error("官方通告中未识别到" + day + "的尾号规则");
      tails[index + 1] = match[1] + "、" + match[2];
    });
    var time = text.match(/“?尾号限行”?时间[：:]\s*工作日\s*(\d{1,2}:\d{2})\s*至\s*(\d{1,2}:\d{2})/);
    if (!time) throw new Error("官方通告中未识别到限行时段");
    return { tails: tails, time: time[1] + "–" + time[2] };
  }

  function dateLine(date, rules) {
    var weekday = date.getDay();
    var weekdayNames = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
    var label = (date.getMonth() + 1) + "月" + date.getDate() + "日（" + weekdayNames[weekday] + "）";
    if (weekday === 0 || weekday === 6) return label + "：常态规则下不限行（周末）";
    return label + "：尾号 " + rules.tails[weekday] + " 限行，时段 " + rules.time;
  }

  function makeData(args, rules) {
    var city = String(args.city).toLowerCase();
    if (city !== "cd" && city !== "chengdu") throw new Error("此官方数据源仅支持成都，请将 city 参数设为 cd");
    var now = new Date(), tomorrow = new Date(now.getTime());
    tomorrow.setDate(tomorrow.getDate() + 1);
    var title = "成都车辆限行（" + args.cartype + "·" + args.loo + "）";
    var content = "今日：" + dateLine(now, rules) + "\n明日：" + dateLine(tomorrow, rules) +
      "\n\n依据：成都市公安局公布的常态尾号限行规则。\n" +
      "提示：本结果按星期套用常态规则；法定节假日调休、临时管控等例外未自动核验，请以成都交警最新通告为准。\n" +
      "官方通告：" + OFFICIAL_URL + "\n查询时间：" + now.toLocaleString();
    return { title: title, content: content, icon: "car" };
  }

  function finish(data, mode) {
    if (mode === "notify") { $notification.post(data.title, "", data.content); $done({}); }
    else $done({ title: data.title, content: data.content, icon: data.icon });
  }
  function fail(error, mode) {
    var message = error && error.message ? error.message : String(error);
    console.log("[限行查询] 失败：" + message);
    if (mode === "notify") { $notification.post("成都限行查询失败", "", message); $done({}); }
    else $done({ title: "成都限行查询失败", content: message + "\n\n请稍后重试或查看成都交警官方通告。", icon: "car" });
  }

  var args = parseArgs(typeof $argument === "undefined" ? "" : $argument);
  var mode = args.mode === "notify" ? "notify" : "panel";
  if (String(args.city).toLowerCase() !== "cd" && String(args.city).toLowerCase() !== "chengdu") return fail(new Error("此官方数据源仅支持成都，请将 city 参数设为 cd"), mode);
  console.log("[限行查询] source=成都市公安局官方通告");
  console.log("[限行查询] URL=" + OFFICIAL_URL);
  $httpClient.get({
    url: OFFICIAL_URL,
    timeout: 20,
    headers: {
      "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    }
  }, function (error, response, body) {
    if (error) return fail(error, mode);
    if (!body) return fail(new Error("成都市公安局未返回页面正文"), mode);
    console.log("[限行查询] HTTP=" + (response && (response.statusCode || response.status) || "unknown") + " bodyLength=" + String(body).length);
    try {
      var data = makeData(args, extractOfficialRules(body));
      return finish(data, mode);
    } catch (e) {
      var title = (String(body).match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "";
      console.log("[限行查询] 页面诊断 title=" + (htmlToText(title) || "(无标题)") + " excerpt=" + htmlToText(body).slice(0, 240));
      return fail(e, mode);
    }
  });
})();
