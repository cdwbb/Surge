/*
 * Surge 车辆限行查询 - 修复版
 * 功能：面板展示 + 独立定时通知
 * 不依赖 Cheerio、jsDelivr 或其他外部 JS 库
 */

(function () {
  "use strict";

  var DEFAULTS = {
    city: "cd",
    loo: "本地车",
    cartype: "燃油车",
    mode: "panel"
  };

  function parseArgs(raw) {
    var result = {};
    if (raw && typeof raw === "object") {
      result = raw;
    } else if (typeof raw === "string" && raw.length) {
      raw.split("&").forEach(function (part) {
        var p = part.indexOf("=");
        var k = p >= 0 ? part.slice(0, p) : part;
        var v = p >= 0 ? part.slice(p + 1) : "";
        try {
          result[decodeURIComponent(k.replace(/\+/g, " "))] =
            decodeURIComponent(v.replace(/\+/g, " "));
        } catch (_) {
          result[k] = v;
        }
      });
    }
    Object.keys(DEFAULTS).forEach(function (key) {
      if (result[key] === undefined || result[key] === "") {
        result[key] = DEFAULTS[key];
      }
    });
    return result;
  }

  function decodeHtml(text) {
    var named = {
      "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">",
      "&quot;": '"', "&#39;": "'", "&ldquo;": "“",
      "&rdquo;": "”", "&mdash;": "—", "&hellip;": "…"
    };
    text = text.replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;|&ldquo;|&rdquo;|&mdash;|&hellip;/gi,
      function (m) { return named[m.toLowerCase()] || m; });
    text = text.replace(/&#(\d+);/g, function (_, n) {
      return String.fromCharCode(parseInt(n, 10));
    });
    text = text.replace(/&#x([0-9a-f]+);/gi, function (_, n) {
      return String.fromCharCode(parseInt(n, 16));
    });
    return text;
  }

  function htmlToText(html) {
    return decodeHtml(
      String(html || "")
        .replace(/<!--[\s\S]*?-->/g, " ")
        .replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
        .replace(/<(br|hr)\b[^>]*>/gi, "\n")
        .replace(/<\/(p|div|li|h[1-6]|section|article|tr|td|th|ul|ol)>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
    ).replace(/[\t\r ]+/g, " ")
     .replace(/\n\s*/g, "\n")
     .replace(/\n{2,}/g, "\n")
     .trim();
  }

  function firstMatch(text, regex) {
    var m = text.match(regex);
    return m ? String(m[1] || "").trim() : "";
  }

  function sectionText(text, label, stopLabels) {
    var start = text.indexOf(label);
    if (start < 0) return "";
    start += label.length;
    var end = text.length;
    stopLabels.forEach(function (stop) {
      var pos = text.indexOf(stop, start);
      if (pos >= 0 && pos < end) end = pos;
    });
    return text.slice(start, end).replace(/^[\s:：]+|[\s:：]+$/g, "").trim();
  }

  function buildUrl(args) {
    var city = String(args.city || "cd").toLowerCase().trim();
    var host = city === "sz" ? "m.bendibao.com" : "m." + city + ".bendibao.com";
    var query = "category=" + encodeURIComponent(args.cartype) +
                "&loo=" + encodeURIComponent(args.loo);
    return "https://" + host + "/news/xianxingchaxun/?" + query;
  }

  function parsePage(html, args) {
    var text = htmlToText(html);

    var todayMatch = text.match(
      /今日限行\s*(\d{1,2}月\d{1,2}日\s*[（(]周[一二三四五六日天][）)])\s*(不限号|[\d,，、]+)/
    );
    var tomorrowMatch = text.match(
      /明日限行\s*(\d{1,2}月\d{1,2}日\s*[（(]周[一二三四五六日天][）)])\s*(不限号|[\d,，、]+)/
    );

    var todayDate = todayMatch ? todayMatch[1].trim() : "";
    var todayRule = todayMatch ? todayMatch[2].trim() : "";
    var tomorrowDate = tomorrowMatch ? tomorrowMatch[1].trim() : "";
    var tomorrowRule = tomorrowMatch ? tomorrowMatch[2].trim() : "";

    // 兼容页面不带星期括号的情况
    if (!todayRule) {
      var todayFallback = text.match(/今日限行\s*(\d{1,2}月\d{1,2}日)\s*(不限号|[\d,，、]+)/);
      if (todayFallback) {
        todayDate = todayFallback[1].trim();
        todayRule = todayFallback[2].trim();
      }
    }
    if (!tomorrowRule) {
      var tomorrowFallback = text.match(/明日限行\s*(\d{1,2}月\d{1,2}日)\s*(不限号|[\d,，、]+)/);
      if (tomorrowFallback) {
        tomorrowDate = tomorrowFallback[1].trim();
        tomorrowRule = tomorrowFallback[2].trim();
      }
    }

    var stops = ["查看详情", "限行时间", "限行区域", "限行规则", "今日限行", "明日限行"];
    var rule = sectionText(text, "限行规则", stops);
    var time = sectionText(text, "限行时间", stops);
    var area = sectionText(text, "限行区域", stops);

    // 页面可能重复展示不同车辆类别；请求参数由 category/loo 交给站点筛选。
    if (!todayRule && !tomorrowRule && !time && !area && !rule) {
      throw new Error("页面已返回，但未识别到限行字段。可能是网站 HTML 结构再次变化，或查询参数未被页面接受。");
    }

    var cityNames = { cd: "成都", bj: "北京", sh: "上海", sz: "深圳", gz: "广州", tj: "天津", cq: "重庆" };
    var cityName = cityNames[String(args.city).toLowerCase()] || String(args.city).toUpperCase();
    var title = cityName + "车辆限行（" + args.cartype + "·" + args.loo + "）";

    var lines = [];
    if (todayDate || todayRule) lines.push("今日限行：" + [todayDate, todayRule].filter(Boolean).join(" "));
    if (tomorrowDate || tomorrowRule) lines.push("明日限行：" + [tomorrowDate, tomorrowRule].filter(Boolean).join(" "));
    if (time) lines.push("限行时间：" + time);
    if (area) lines.push("限行区域：" + area);
    if (rule) lines.push("限行规则：" + rule);
    lines.push("数据来源：成都本地宝");
    lines.push("查询时间：" + new Date().toLocaleString());

    return { title: title, content: lines.join("\n\n"), icon: "car" };
  }

  function finishPanel(data) {
    $done({ title: data.title, content: data.content, icon: data.icon || "car" });
  }

  function notify(data) {
    $notification.post(data.title, "", data.content);
    $done({});
  }

  function fail(error, mode) {
    var message = (error && error.message) ? error.message : String(error);
    console.log("[限行查询] 失败：" + message);
    if (mode === "notify") {
      $notification.post("车辆限行查询失败", "", message);
      $done({});
    } else {
      $done({
        title: "车辆限行查询失败",
        content: "获取限行信息失败：\n" + message + "\n\n请检查网络或稍后重试。",
        icon: "car"
      });
    }
  }

  var args = parseArgs(typeof $argument === "undefined" ? "" : $argument);
  var mode = args.mode === "notify" ? "notify" : "panel";
  var url = buildUrl(args);

  console.log("[限行查询] mode=" + mode);
  console.log("[限行查询] URL=" + url);

  $httpClient.get({
    url: url,
    timeout: 15,
    headers: {
      "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    }
  }, function (error, response, body) {
    if (error) return fail(error, mode);
    if (!response || response.statusCode < 200 || response.statusCode >= 400) {
      return fail(new Error("HTTP 状态码异常：" + (response ? response.statusCode : "无响应")), mode);
    }
    var bodyText = String(body || "");
    console.log("[限行查询] HTTP=" + response.statusCode + " bodyLength=" + bodyText.length);
    try {
      var data = parsePage(bodyText, args);
      console.log("[限行查询] 解析成功：" + data.content);
      if (mode === "notify") return notify(data);
      return finishPanel(data);
    } catch (e) {
      var title = firstMatch(bodyText, /<title[^>]*>([\s\S]*?)<\/title>/i);
      var excerpt = htmlToText(bodyText).slice(0, 240).replace(/\s+/g, " ");
      console.log("[限行查询] 页面诊断 title=" + (title || "(无标题)") + " excerpt=" + (excerpt || "(空响应)"));
      return fail(e, mode);
    }
  });
})();
