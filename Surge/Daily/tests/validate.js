/*
 * Static + mocked Surge API validation. This is a Node-only developer check;
 * the scripts under js/ do not use Node APIs.
 */
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var root = path.resolve(__dirname, "..");
var moduleText = fs.readFileSync(path.join(root, "Daily.sgmodule"), "utf8");
var holidays = JSON.parse(fs.readFileSync(path.join(root, "config", "holidays.json"), "utf8"));
var scriptFiles = fs.readdirSync(path.join(root, "js")).filter(function (f) { return /\.js$/.test(f); });
var errors = [];
function assert(condition, message) { if (!condition) errors.push(message); }
function fileFor(name) { return path.join(root, "js", name); }
var argLine = (moduleText.match(/^#!arguments=(.*)$/m) || ["", ""])[1];
var moduleArgs = {};
argLine.split(",").forEach(function (part) { var at = part.indexOf(":"); moduleArgs[(at < 0 ? part : part.slice(0, at)).trim()] = at < 0 ? "" : part.slice(at + 1); });
var argNames = Object.keys(moduleArgs);

scriptFiles.forEach(function (name) {
  var source = fs.readFileSync(fileFor(name), "utf8");
  try { new vm.Script(source, { filename: name }); } catch (e) { errors.push(name + " syntax: " + e.message); }
  assert(!/cdn\.jsdelivr\.net|cdnjs|cheerio/i.test(source), name + " must not depend on external JS/CDN");
});

var panelSection = moduleText.split("[Panel]")[1].split("[Script]")[0];
var scriptSection = moduleText.split("[Script]")[1];
var panels = [];
var panelScripts = [];
var declared = {};
panelSection.split(/\r?\n/).forEach(function (line) {
  var match = line.match(/^([^#=][^=]*?)\s*=.*script-name=([^,\s]+)/);
  if (match) { panels.push(match[1].trim()); panelScripts.push(match[2]); }
});
scriptSection.split(/\r?\n/).forEach(function (line) {
  var match = line.match(/^([^#=][^=]*?)\s*=\s*type=(generic|cron),\s*script-path=([^,\s]+)/);
  if (match) {
    var name = match[1].trim();
    declared[name] = match[2];
    var marker = "/Surge/Daily/";
    var at = match[3].indexOf(marker);
    assert(at >= 0, name + " script path must point inside Surge/Daily");
    if (at >= 0) assert(fs.existsSync(path.join(root, match[3].slice(at + marker.length))), name + " script path does not exist locally");
  }
});
assert(panels.length === 5, "Module must define exactly five independent panels");
panelScripts.forEach(function (name) { assert(declared[name] === "generic", "Panel script mapping must resolve to a generic script: " + name); });
assert(!/限行/.test(moduleText), "Module must not include traffic restriction features");
assert(/cronexp="\{\{\{cron_schedule\}\}\}"/.test(moduleText), "Cron expression placeholder must be quoted");
assert(/cron_schedule:0 8 \* \* \*/.test(moduleText), "default Cron must be a five-field daily schedule");
assert(/(?:^|\n)\S+\s*=\s*type=cron,/m.test(scriptSection), "Module must contain independent Cron scripts");
assert(argNames.length >= 20, "adjustable settings should be declared as Module parameters");
argNames.forEach(function (name) { assert(/^[A-Za-z0-9_]+$/.test(name), "Module parameter names must be ASCII letters, digits, or underscores: " + name); });
var placeholders = moduleText.match(/\{\{\{([^}]+)\}\}\}/g) || [];
placeholders.forEach(function (placeholder) { var name = placeholder.slice(3, -3); assert(Object.prototype.hasOwnProperty.call(moduleArgs, name), "undeclared Module placeholder: " + name); });
assert(holidays.years["2026"].status === "official", "2026 calendar arrangement must be marked official");
assert(holidays.years["2027"].status === "unconfirmed", "unannounced 2027 holidays must be marked unconfirmed");
assert(moduleArgs.city === "成都" && moduleArgs.latitude === "30.5728", "default city parameters must be Chengdu coordinates");
assert(moduleArgs.oil_92 === "0" && moduleArgs.oil_source_url === "none", "oil Module parameters must default to no official price");
assert(!fs.existsSync(path.join(root, "config", "settings.json")), "adjustable settings should not be duplicated in settings.json");

var panelNames = ["Weather_Panel.js", "Calendar_Panel.js", "Air_Panel.js", "Network_Panel.js", "Oil_Panel.js"];
panelNames.forEach(function (name) {
  var source = fs.readFileSync(fileFor(name), "utf8");
  assert(!/\$notification\s*\.\s*post/.test(source), name + " panel must not send notifications");
  if (name !== "Oil_Panel.js") {
    assert(/\$persistentStore\.read/.test(source) && /\$persistentStore\.write/.test(source), name + " must read/write its own cache");
    assert(/timeout\s*:/.test(source), name + " requests must have an explicit timeout");
  }
});
assert(!/cheerio|cdn\.jsdelivr\.net|cdnjs/i.test(moduleText + scriptFiles.join("\n")), "Module must not reference third-party JS/CDN dependencies");

function mockDate() {
  var RealDate = Date;
  function FixedDate() {
    var args = Array.prototype.slice.call(arguments);
    return args.length ? new (Function.prototype.bind.apply(RealDate, [null].concat(args)))() : new RealDate("2026-11-15T10:00:00+08:00");
  }
  FixedDate.now = function () { return new RealDate("2026-11-15T10:00:00+08:00").getTime(); };
  FixedDate.prototype = RealDate.prototype;
  return FixedDate;
}
function evaluate(name, options) {
  options = options || {};
  var calls = [], posts = [], output = null, store = options.initialStore || {};
  var context = {
    Date: options.Date || Date,
    encodeURIComponent: encodeURIComponent,
    console: console,
    $argument: options.argument || "",
    $network: { wifi: { ssid: "Test Wi-Fi" }, v4: { primaryAddress: "192.0.2.2" }, v6: { primaryAddress: "2001:db8::2" }, dns: ["192.0.2.53"], "cellular-data": {} },
    $persistentStore: {
      read: function (key) { return store[key] || null; },
      write: function (value, key) { store[key] = value; return true; }
    },
    $notification: { post: function () { posts.push(Array.prototype.slice.call(arguments)); } },
    $done: function (value) { output = value || {}; },
    $httpClient: { get: function (request, callback) {
      var url = typeof request === "string" ? request : request.url;
      calls.push(request);
      if (options.failPattern && new RegExp(options.failPattern).test(url)) { callback("simulated network failure", null, null); return; }
      var data;
      if (/holidays\.json$/.test(url)) data = holidays;
      else if (/air-quality-api/.test(url)) data = { current: { time: "2026-11-15T10:00", us_aqi: options.airAqi == null ? 42 : options.airAqi, pm2_5: 8.5, pm10: 11.2 } };
      else if (/api\.open-meteo\.com/.test(url)) data = { current: { time: "2026-11-15T10:00", temperature_2m: options.weatherTemperature == null ? 17 : options.weatherTemperature, apparent_temperature: 16, relative_humidity_2m: 60, wind_speed_10m: 4, weather_code: 2 }, daily: { time: ["2026-11-15", "2026-11-16"], weather_code: [2, 3], temperature_2m_max: [20, 19], temperature_2m_min: [12, 11] } };
      else data = "success";
      callback(null, { status: /generate_204/.test(url) ? 204 : 200, headers: {} }, typeof data === "string" ? data : JSON.stringify(data));
    } }
  };
  try { vm.runInNewContext(fs.readFileSync(fileFor(name), "utf8"), context, { filename: name }); }
  catch (e) { errors.push(name + " mock execution: " + e.message); }
  return { output: output, calls: calls, posts: posts, store: store };
}

var result = evaluate("Weather_Panel.js");
assert(result.output && /体感 16/.test(result.output.content), "weather mock must render current and apparent temperatures");
assert(result.output && /未来预报/.test(result.output.content) && /来源：Open-Meteo/.test(result.output.content), "weather mock must render forecast and source");
assert(result.posts.length === 0, "weather panel must not notify");
result = evaluate("Weather_Panel.js", { argument: "city=重庆&latitude=29.563&longitude=106.551&timezone=Asia%2FShanghai&forecast_days=4" });
assert(result.output && /重庆天气/.test(result.output.title) && /forecast_days=4/.test(result.calls[0].url), "weather panel must use Module city and forecast parameters");
result = evaluate("Air_Panel.js");
assert(result.output && /模型估算，非中国官方监测站实时值/.test(result.output.content), "air mock must identify model-estimated data");
assert(result.output && /PM2\.5/.test(result.output.content) && /PM10/.test(result.output.content), "air mock must display PM2.5 and PM10");
result = evaluate("Air_Panel.js", { argument: "city=重庆&latitude=29.563&longitude=106.551&timezone=Asia%2FShanghai" });
assert(result.output && /重庆空气质量/.test(result.output.title) && /latitude=29.563/.test(result.calls[0].url), "air panel must use Module city parameters");
result = evaluate("Calendar_Panel.js", { Date: mockDate() });
assert(result.output && /2026-11-15/.test(result.output.content) && /十月初七/.test(result.output.content), "calendar mock must render correct 2026 lunar date");
assert(result.output && /周末休息/.test(result.output.content), "calendar mock must label ordinary weekend");
result = evaluate("Network_Panel.js");
assert(result.output && /IPv4：192\.0\.2\.2/.test(result.output.content) && /不是 ICMP Ping/.test(result.output.content), "network mock must render environment and distinguish HTTP probe");
assert(result.output && /HTTP 204/.test(result.output.content), "network mock must render probe status and latency");
assert(result.output && /来源：Surge \$network/.test(result.output.content), "network mock must identify its local data source");
result = evaluate("Network_Panel.js", { argument: "network_timeout=12&probe_1_url=https%3A%2F%2Fprobe.example%2Fone&probe_2_url=https%3A%2F%2Fprobe.example%2Ftwo" });
assert(result.calls.length === 2 && /probe\.example\/one/.test(result.calls[0].url) && result.calls[0].timeout === 12, "network panel must use Module timeout and target parameters");
result = evaluate("Oil_Panel.js");
assert(result.output && /暂无可靠官方数据/.test(result.output.content), "oil mock must not invent official prices");
var validOilArgs = "oil_date=2026-11-12&oil_92=8.46&oil_95=9.04&oil_diesel=8.09&oil_source_url=https%3A%2F%2Ffgw.sc.gov.cn%2Ftest%2Fnotice.html&oil_forecast_date=none";
result = evaluate("Oil_Panel.js", { argument: validOilArgs });
assert(result.output && /执行日期：2026-11-12/.test(result.output.content) && /92号汽油：¥8\.46/.test(result.output.content), "oil panel must render valid official-source Module parameters");
result = evaluate("Oil_Panel.js", { argument: "oil_date=2026-99-99&oil_92=8.46&oil_95=9.04&oil_diesel=8.09&oil_source_url=https%3A%2F%2Ffgw.sc.gov.cn%2Ftest%2Fnotice.html" });
assert(result.output && /暂无可靠官方数据/.test(result.output.content), "oil panel must reject invalid dates");
result = evaluate("Weather_Panel.js", { failPattern: "api\\.open-meteo", initialStore: { cd_daily_weather_v1: JSON.stringify({ content: "旧天气缓存" }) } });
assert(result.output && /旧天气缓存/.test(result.output.content) && /可能不是最新/.test(result.output.content), "weather network failure must fall back to clearly marked cache");
result = evaluate("Air_Panel.js", { failPattern: "air-quality-api", initialStore: { cd_daily_air_v1: JSON.stringify({ content: "旧空气缓存" }) } });
assert(result.output && /旧空气缓存/.test(result.output.content) && /可能过期/.test(result.output.content), "air network failure must fall back to clearly marked cache");
result = evaluate("Network_Panel.js", { failPattern: "connectivitycheck|apple\.com" });
assert(result.output && /❌ 异常/.test(result.output.content), "failed HTTP probes must be shown as failures");
result = evaluate("Weather_Notify.js", { argument: "enabled=1&weather_cold=10&weather_hot=38", weatherTemperature: 8 });
assert(result.posts.length === 1 && /低温提醒/.test(result.posts[0][1]), "weather cron must notify when its configured threshold is crossed");
result = evaluate("Weather_Notify.js", { argument: "enabled=1", weatherTemperature: 2, initialStore: { cd_daily_weather_notice_v1: "cold" } });
assert(result.posts.length === 0, "weather cron must suppress duplicate alert state");
result = evaluate("Air_Notify.js", { argument: "enabled=1", airAqi: 151 });
assert(result.posts.length === 1 && /模型估算/.test(result.posts[0][2]), "air cron must notify above threshold and identify modeled AQI");
var priorOil = evaluate("Oil_Notify.js", { argument: "enabled=1&" + validOilArgs }).store;
result = evaluate("Oil_Notify.js", { argument: "enabled=1&oil_date=2026-11-20&oil_92=8.20&oil_95=8.80&oil_diesel=7.90&oil_source_url=https%3A%2F%2Ffgw.sc.gov.cn%2Ftest%2Fnotice.html", initialStore: priorOil });
assert(result.posts.length === 1 && /油价更新/.test(result.posts[0][0]), "oil cron must notify once when configured official price data changes");
["Weather_Notify.js", "Air_Notify.js", "Oil_Notify.js"].forEach(function (name) {
  result = evaluate(name, { argument: "enabled=0" });
  assert(result.calls.length === 0 && result.posts.length === 0, name + " must do no work when disabled");
});

if (errors.length) {
  console.error("Validation failed:\n- " + errors.join("\n- "));
  process.exit(1);
}
console.log("PASS: JavaScript syntax, JSON, Module mappings/paths/Cron, panel-notification isolation, cache/timeouts, and mocked panel/disabled-notification behavior.");
