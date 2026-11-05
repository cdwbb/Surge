/**
 * 高德地图去广告 · 本地自包含脚本（Surge http-request / http-response）
 * ---------------------------------------------------------------------------
 * 设计目标
 *   1. 零远程依赖：不请求任何 URL，不加载任何第三方库，不读写持久化存储。
 *   2. 一个文件两条阶段，用 $script.type 区分、$response 是否存在兜底：
 *        http-request  -> 纯广告接口直接返回 {}（等价于原模块的 [Map Local]）
 *        http-response -> 业务接口做 JSON 字段级清洗（等价于原模块的 [Script]
 *                         与 [Body Rewrite]）。此阶段模块必须配
 *                         requires-body=true，否则脚本拿不到响应体。
 *   3. 原模块里 [Script] 有 4 处重名条目（"移除路线规划推广"、"移除首页推广"
 *      各出现两次），Surge 的 [Script] 是键值段，重名会互相覆盖，实际只生效
 *      13 条；本脚本按 URL 分派，不存在覆盖问题。
 *   4. [Body Rewrite] / [Map Local] 不在 Surge 官方 Module 可补丁的 Section
 *      列表里，这里全部收敛到脚本，模块只保留 [Rule] + [Script] + [MITM]。
 *   5. 只删明确的广告键；adCode / adName / address 等高德行政区与业务字段
 *      有豁免表，不会被通用键名匹配误删（这会让城市、区域显示异常）。
 *
 * 规则来源
 *   - QingRex/LoonKissSurge 的「高德地图去广告.sgmodule」（2026-02-22）的
 *     15 条 Script、5 条 Body Rewrite、15 条 Map Local 接口清单。
 *   - 上游作者当前版 Loon 插件 Amap_remove_ads.lpx（2026-10-20）以及
 *     Resource/JQLang/Amap/{updatable,search_poi_detail}.jq 中的字段级清单，
 *     已用原生 JS 重新实现（原 JS 脚本 Amap_remove_ads.js 在源站已 404）。
 *   - RuCu6 amap.js（2024-10-15，经 jqyisbest/RuCu6 镜像可取）里的逐接口
 *     字段处理：搜索结果列表、POI 详情模块删除清单、导航插播广告、
 *     公交/酒店/步行结束页等。只吸收其字段事实，代码为独立实现。
 *   - 完全重写，未复制、未引用任何原始脚本代码，也不在运行时下载任何资源。
 *
 * 安装
 *   把本文件放到 Surge 的 Profile（配置文件）所在目录，
 *   模块里 script-path 直接写文件名 Amap_remove_ads.js 即可。
 *   相对路径的解析基准是 Profile 目录，不是模块 URL —— 这点很关键。
 *
 * 开关（改 Surge 里模块的参数即可，不用改代码）
 *   模块用 #!arguments 暴露 14 个参数，脚本从 $argument 解析：
 *     splash      开屏广告                      1 开 / 0 关
 *     home        首页卡片与图层配置            1 / 0
 *     search      搜索页推广（热词/联想/结果）  1 / 0
 *     nearby      附近页推荐                    1 / 0
 *     route       路线规划与导航内广告          1 / 0
 *     taxi        打车页资源位                  1 / 0
 *     poi         地点详情页推广                1 / 0
 *     profile     我的页面推广                  1 / 0
 *     banner      横幅、AI 推荐、消息盒          1 / 0
 *     tools       工具宫格、转化列表            1 / 0
 *     mock        纯广告接口直接在请求阶段拦截  1 / 0
 *     strict      通用递归清洗（较激进）        1 / 0
 *     poi_strict  地点详情按白名单裁剪（激进）  1 / 0，默认 0
 *     log         输出去广告日志                1 / 0，默认 0
 *   缺省一律按「开」处理（log / poi_strict 除外），所以老配置不会因为
 *   少传参数而失效。
 *
 * 注意
 *   - 使用 MITM 且信任 Surge CA 后脚本才会运行；Rewrite / Scripting 功能
 *     开关也要打开。auto-quic-block 默认 true，命中 MITM 列表时会自动
 *     阻断 QUIC 迫使回退，个别漏网可在主配置加 PROTOCOL,QUIC,REJECT。
 *   - http-response 侧只改 body，不改 status / headers；Surge 会自行重算
 *     Content-Length，避免破坏报文框架。
 *   - 任何解析失败或异常都原样放行，绝不让去广告把业务请求搞坏。
 *   - console.log 不使用对象字符串拼接，避免真机日志变成 [object Object]。
 *   - 全程只用 ES5 语法，JSC 与 WebView 双引擎均可运行。
 */
(function () {
  'use strict';

  /* =====================================================================
   * 零、参数开关
   *   $argument 由模块的 [Script] 条目传入，形如 home=1&taxi=0&log=1。
   *   用 & 分隔而不是逗号：Surge 的 [Script] 参数本身就是逗号分隔的
   *   key=value，值里再出现逗号会被截断。
   * ===================================================================== */
  var ARG_OFF = { '0': 1, 'false': 1, 'off': 1, 'no': 1 };
  var ARGS = {};
  (function parseArgs() {
    var raw = (typeof $argument === 'string' && $argument) || '';
    if (!raw) return;
    var parts = raw.split('&');
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      var eq = p.indexOf('=');
      if (eq <= 0) continue;
      var k = p.slice(0, eq).replace(/\s+/g, '');
      if (!k) continue;
      ARGS[k] = p.slice(eq + 1).replace(/\s+/g, '').toLowerCase();
    }
  })();

  /* 只有这三项默认为关，其余（含所有功能开关）默认为开。 */
  var DEFAULT_OFF = { log: 1, poi_strict: 1 };

  function flagOn(key) {
    if (Object.prototype.hasOwnProperty.call(ARGS, key)) {
      return !ARG_OFF[ARGS[key]];
    }
    return !DEFAULT_OFF[key];
  }

  var DEBUG = flagOn('log');
  var STRICT_CLEAN = flagOn('strict');
  var POI_DETAIL_STRICT = flagOn('poi_strict');
  var EMPTY_BODY = '{}';
  var MAX_DEPTH = 12;
  var MAX_NODES = 30000;

  var finished = false;
  function done(result) {
    if (finished) return;
    finished = true;
    $done(result || {});
  }
  function log(msg) {
    if (DEBUG && typeof console !== 'undefined' && console.log) {
      console.log('[AmapAdBlock] ' + msg);
    }
  }

  /* =====================================================================
   * 一、通用工具
   * ===================================================================== */
  function isObj(v) { return v !== null && typeof v === 'object'; }

  function get(obj, path) {
    var parts = Array.isArray(path) ? path : String(path).split('.');
    var cur = obj;
    for (var i = 0; i < parts.length; i++) {
      if (!isObj(cur) && !Array.isArray(cur)) return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }

  function del(obj, path) {
    var parts = Array.isArray(path) ? path : String(path).split('.');
    var cur = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      if (!isObj(cur) && !Array.isArray(cur)) return false;
      cur = cur[parts[i]];
    }
    if (!isObj(cur) && !Array.isArray(cur)) return false;
    var key = parts[parts.length - 1];
    if (!Object.prototype.hasOwnProperty.call(cur, key)) return false;
    if (Array.isArray(cur)) cur.splice(parseInt(key, 10), 1);
    else delete cur[key];
    return true;
  }

  function delPaths(obj, paths) {
    var n = 0;
    for (var i = 0; i < paths.length; i++) if (del(obj, paths[i])) n++;
    return n;
  }

  function setPath(obj, path, value) {
    var parts = Array.isArray(path) ? path : String(path).split('.');
    var cur = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      if (!isObj(cur[parts[i]])) return false;
      cur = cur[parts[i]];
    }
    if (!isObj(cur) && !Array.isArray(cur)) return false;
    cur[parts[parts.length - 1]] = value;
    return true;
  }

  /* 配置中心里的图层开关是 {status, version, value} 结构。直接 delete 会
   * 让客户端以为「服务端没下发」而回退到内置默认值（可能照样出广告）；
   * 置空成「已下发但关闭」更稳。结构不符时才退回 delete。 */
  function disableOrDelete(obj, path) {
    var parts = Array.isArray(path) ? path : String(path).split('.');
    var target = get(obj, parts);
    if (isObj(target) && Object.prototype.hasOwnProperty.call(target, 'status')) {
      var parent = parts.length > 1 ? get(obj, parts.slice(0, -1)) : obj;
      if (isObj(parent) || Array.isArray(parent)) {
        parent[parts[parts.length - 1]] = { status: 1, version: '', value: '' };
        return true;
      }
    }
    return del(obj, parts);
  }

  function filterArrayAt(obj, path, keepFn) {
    var arr = get(obj, path);
    if (!Array.isArray(arr)) return 0;
    var kept = arr.filter(keepFn);
    if (kept.length === arr.length) return 0;
    setPath(obj, path, kept);
    return arr.length - kept.length;
  }

  function dropKeys(obj, keys, stat) {
    if (!isObj(obj)) return 0;
    var n = 0;
    for (var i = 0; i < keys.length; i++) {
      if (Object.prototype.hasOwnProperty.call(obj, keys[i])) {
        delete obj[keys[i]];
        n++;
      }
    }
    if (stat) stat.removed += n;
    return n;
  }

  /* ---- 广告键判定 ----------------------------------------------------
   * 刻意不使用简单的 indexOf('ad')：那会误伤 address / adapter / load 等
   * 正常字段。这里用「精确键名 + 分词命中 + 明确子串」三重判定。
   * ------------------------------------------------------------------- */
  var AD_EXACT = {
    'tipdata': 1, 'tipsadv': 1, 'tipsoperationlocation': 1,
    'commonmaterial': 1, 'resourceplacement': 1, 'history_tags': 1,
    'shadingwords': 1, 'operation_activity': 1, 'adstatementconfig': 1,
    'adcustomerretainarchitecture': 1, 'adimentryconfig': 1,
    'advenueconfig': 1, 'adperfswitch': 1, 'endnavic3adcard': 1,
    'infocpcreport': 1, 'hotsaleconfig': 1, 'marketing_resource_config': 1,
    'splashscreen': 1, 'splash_screen': 1, 'splashscreencontrol': 1,
    'mainbubble': 1, 'bluebar': 1, 'mainicon': 1, 'pop_selection': 1,
    'popupinfo': 1, 'commoncoupon': 1, 'recommendcard': 1
  };

  /* 刻意不放 'ad' / 'ads' 这类过短词：高德接口里 adCode / adName / adInfo
   * 是行政区划信息，按分词命中会把它们当成广告删掉，导致城市、区域显示异常。
   * 明确广告键一律走 AD_EXACT / AD_SUBSTR 精确判定。
   * 同理 'activity' / 'material' / 'commercial' 太泛，改由上游字段清单精确删除。 */
  var AD_WORDS = {
    'advert': 1, 'advertisement': 1, 'advertising': 1,
    'splash': 1, 'marketing': 1, 'promotion': 1, 'promo': 1,
    'banner': 1, 'popup': 1, 'coupon': 1, 'lottery': 1,
    'hotword': 1, 'hotwords': 1, 'hotsale': 1,
    'tipdata': 1, 'tipsadv': 1, 'commonmaterial': 1,
    'resourceplacement': 1, 'adconfig': 1, 'adcard': 1,
    'adlist': 1, 'adbanner': 1
  };

  var AD_SUBSTR = [
    'advert', 'splash', 'banner', 'popup', 'lottery', 'coupon',
    'marketing', 'promotion', 'promo_', '_promo',
    'hotword', 'hotsale', 'adcard', 'adconfig', 'adlist', 'adbanner',
    'adstatement', 'advenue', 'adperf', 'adcustomer', 'adim_',
    'giftentry'
  ];

  /* 永不删除的业务字段（统一按小写比对）。高德用 ad* 表示行政区，
   * 不是广告；其余几个是包含 ad / load 等子串的常见正常字段。 */
  var SAFE_KEYS = {
    'adcode': 1, 'ad_code': 1, 'adname': 1, 'ad_name': 1,
    'adlevel': 1, 'ad_level': 1, 'adinfo': 1, 'ad_info': 1,
    'adprovince': 1, 'adcity': 1, 'addistrict': 1, 'adarea': 1,
    'adboundary': 1, 'adtype': 1, 'address': 1, 'adapter': 1,
    'addition': 1, 'additional': 1, 'head_img': 1, 'headimg': 1,
    'load_config': 1, 'loadconfig': 1, 'upload': 1, 'download': 1,
    'trade': 1, 'tradename': 1, 'thread': 1, 'threshold': 1
  };

  function isAdKey(key) {
    var raw = String(key);
    var k = raw.toLowerCase();
    if (SAFE_KEYS[k]) return false;
    if (AD_EXACT[k]) return true;
    // 不能用 indexOf('ad_')：head_ / bad_ 这类正常字段会被误伤，
    // 只认以 ad_ 开头的键。
    if (k.indexOf('ad_') === 0) return true;
    for (var i = 0; i < AD_SUBSTR.length; i++) {
      if (k.indexOf(AD_SUBSTR[i]) !== -1) return true;
    }
    var words = raw.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
                   .toLowerCase().split(/[^a-z0-9]+/);
    for (var j = 0; j < words.length; j++) {
      if (words[j] && AD_WORDS[words[j]]) return true;
    }
    return false;
  }

  /* 上游 jq 里把一批推荐/引导开关置 0，这里等价实现，
   * 只在「内嵌 JSON 配置串」范围内生效，避免误伤响应主体。 */
  var ZERO_SWITCHES = {
    'end_auto_foot_explore': 0, 'ExtremelyRecommendCount': 0,
    'his_recommend_bangdan': 0, 'nearby_picture_on': 0,
    'nearby_picture_distance': 0, 'nearby_feed_poi_card_v2_multi_img': 0,
    'isGoodsShelfPerfV2': 0, 'NearbySearchOptimization': 0,
    'recommend_point_optimization': 0, 'recommend_point_service_overview': 0,
    'end_point_optimization': 0, 'hitch_way_point_nav_default': 0,
    'can_show_advert': 0, 'advert_note_num': 0,
    'secondScreenAnchorModule': ''
  };

  function zeroSwitches(node, depth, stat) {
    if (depth > MAX_DEPTH || stat.nodes > MAX_NODES || !isObj(node)) return;
    if (Array.isArray(node)) {
      for (var i = 0; i < node.length; i++) zeroSwitches(node[i], depth + 1, stat);
      return;
    }
    var keys = Object.keys(node);
    for (var n = 0; n < keys.length; n++) {
      var key = keys[n];
      stat.nodes++;
      if (Object.prototype.hasOwnProperty.call(ZERO_SWITCHES, key) &&
          (typeof node[key] === 'number' || typeof node[key] === 'boolean' ||
           typeof node[key] === 'string')) {
        node[key] = ZERO_SWITCHES[key];
        stat.changed++;
        continue;
      }
      if (isObj(node[key]) || Array.isArray(node[key])) {
        zeroSwitches(node[key], depth + 1, stat);
      }
    }
  }

  function looksLikeJson(s) {
    return typeof s === 'string' && s.length > 8 &&
           (s.charAt(0) === '{' || s.charAt(0) === '[') &&
           s.indexOf('"') !== -1;
  }

  /* 递归清洗：删广告键；遇到 value/config/content/biz 里的 JSON 字符串，
   * 解析后同样清洗再写回（高德配置中心大量配置是「字符串套 JSON」）。 */
  function scrub(node, depth, stat) {
    if (depth > MAX_DEPTH || stat.nodes > MAX_NODES) return;
    if (Array.isArray(node)) {
      for (var i = 0; i < node.length; i++) scrub(node[i], depth + 1, stat);
      return;
    }
    if (!isObj(node)) return;

    var keys = Object.keys(node);
    for (var n = 0; n < keys.length; n++) {
      var key = keys[n];
      var val = node[key];
      stat.nodes++;
      if (isAdKey(key)) {
        delete node[key];
        stat.removed++;
        continue;
      }
      if (typeof val === 'string' &&
          (key === 'value' || key === 'config' || key === 'content' ||
           key === 'biz' || key === 'extra' || key === 'data') &&
          looksLikeJson(val)) {
        try {
          var inner = JSON.parse(val);
          if (isObj(inner) || Array.isArray(inner)) {
            var before = stat.removed + stat.changed;
            scrub(inner, depth + 1, stat);
            zeroSwitches(inner, depth + 1, stat);
            if (stat.removed + stat.changed > before) {
              node[key] = JSON.stringify(inner);
            }
          }
        } catch (e) {
          log('内嵌 JSON 解析跳过: ' + key);
        }
        continue;
      }
      if (isObj(val) || Array.isArray(val)) scrub(val, depth + 1, stat);
    }
  }

  function cleanEmbeddedValues(obj, stat) {
    var data = isObj(obj) ? obj.data : null;
    if (!isObj(data)) return stat.removed;
    var keys = Object.keys(data);
    for (var i = 0; i < keys.length; i++) {
      var item = data[keys[i]];
      if (!isObj(item) || !looksLikeJson(item.value)) continue;
      try {
        var inner = JSON.parse(item.value);
        if (!isObj(inner) && !Array.isArray(inner)) continue;
        var before = stat.removed + stat.changed;
        scrub(inner, 0, stat);
        zeroSwitches(inner, 0, stat);
        if (stat.removed + stat.changed > before) {
          item.value = JSON.stringify(inner);
        }
      } catch (e) {
        log('配置串解析跳过: ' + keys[i]);
      }
    }
    return stat.removed;
  }

  function genericClean(obj, stat) {
    if (STRICT_CLEAN) {
      scrub(obj, 0, stat);
      cleanEmbeddedValues(obj, stat);
    }
    return obj;
  }

  function emptyBody() { return null; } // null = 用 {} 覆盖响应体

  /* =====================================================================
   * 二、按接口的精确规则（函数返回对象 / null / undefined）
   *     null      -> 响应体替换为 {}
   *     undefined -> 原样放行
   *     对象      -> JSON.stringify 后作为新响应体
   * ===================================================================== */

  /* 首页配置中心 aocs/updatable/1：整体图层开关。
   * 合并上游 lpx 与 RuCu6 amap.js 的图层清单，去重后 78 项。
   * 这些键多数是 {status, version, value} 结构，用 disableOrDelete 置空。 */
  var HOME_CONFIG_KEYS = [
    /* ---- 广告 / 商业化 ---- */
    'data.adStatementConfig', 'data.adCustomerRetainArchitecture',
    'data.adImEntryConfig', 'data.adVenueConfig', 'data.adPerfSwitch',
    'data.EndNaviC3AdCard', 'data.infoCpcReport', 'data.hotsaleConfig',
    'data.marketing_resource_config', 'data.coupon_risk_asac',
    'data.commonCouponSceneLog', 'data.sug_coupon_opt',
    'data.giftEntryConfig', 'data.feedback_banner', 'data.TrainOrderBanner',
    'data.hotel_activity', 'data.taxi_activity', 'data.hotel_privilege',
    'data.sportsActivityConfig', 'data.activity_qingke_contry_control',
    'data.920bestwishes', 'data.custom_consultdata.widget_guide',
    'data.free_ride', 'data.homepage_resource_config', 'data.home_message_guide',
    'data.hotel_tipsicon', 'data.sur_bar', 'data.comment_info',
    'data.small_biz_index', 'data.small_biz_fun', 'data.small_biz_b2b_kb',
    'data.small_biz_case', 'data.small_biz_news', 'data.setpagesearch',
    'data.wallet', 'data.favorites_info', 'data.amapCoin', 'data.vip',
    'data.TipsTaxiButton',
    /* ---- 开屏 ---- */
    'data.splashscreen', 'data.SplashScreenControl', 'data.splashview_config',
    /* ---- 首页图层 / 引导 / 活动 ---- */
    'data.nearby_business_popup', 'data.shortcut_popup_frequency',
    'data.tel_retention_popup', 'data.nearby_map_entry_guide',
    'data.nearby_map_pull_down_guide', 'data.home_business_position_config',
    'data.operation_layer', 'data.landing_page_info', 'data.map_weather_switch',
    'data.maplayers', 'data.poi_rec', 'data.route_banner',
    'data.routeresult_banner', 'data.navi_end', 'data.Naviendpage_Searchwords',
    /* ---- 酒店 / 出行 ---- */
    'data.hotel_fillin_opt', 'data.hotel_loop',
    /* ---- 足迹 / 输入提示 ---- */
    'data.footprint', 'data.his_input_tip', 'data.preword',
    /* ---- 搜索词 / 搜索推荐 ---- */
    'data.search_homepage', 'data.search_keyword', 'data.search_moni',
    'data.search_perf', 'data.search_poi_recommend', 'data.search_service_adcode',
    'data.search_word',
    /* ---- 运动 / 测试版提醒 ---- */
    'data.sportsGroupConfig', 'data.sportsHealthConfig', 'data.sportsHomeConfig',
    'data.sportsRouteConfig', 'data.sportsTaskConfig', 'data.sports_walk',
    'data.testflight_adiu', 'data.tf_remind', 'data.tips_bar_black_list'
  ];

  function cleanHomeConfig(obj, stat) {
    for (var i = 0; i < HOME_CONFIG_KEYS.length; i++) {
      if (disableOrDelete(obj, HOME_CONFIG_KEYS[i])) stat.removed++;
    }
    /* 这里刻意不再做整包 scrub：图层键已按清单置空，通用键名匹配会把刚
     * 置空的键又删掉，反而让客户端回退到内置默认值。只清理「字符串套 JSON」
     * 的配置值。 */
    if (STRICT_CLEAN) cleanEmbeddedValues(obj, stat);
    return obj;
  }

  /* 我的页面：上游 jq 的白名单裁剪 */
  /* 合并上游 2026 版 jq 与 RuCu6 的白名单：订单卡必须保留，否则「我的」
   * 页面会没有订单入口。 */
  var PROFILE_CARDS = {
    'MineNewFootprintCard': 1, 'MineNewBEntranceCardV4': 1, 'MyOrderCard': 1
  };
  var ENTRANCE_1 = { '7': 1, '8': 1, '10': 1, '17': 1 };
  var ENTRANCE_2 = { '32': 1, '4': 1, '9': 1, '16': 1, '14': 1 };

  function cleanProfile(obj, stat) {
    stat.removed += delPaths(obj, [
      'data.tipData', 'data.wallet',
      'data.memberInfo',        // 成就勋章 / 等级引导
      'data.topMixedCard'       // 顶部足迹与贡献卡片
    ]);
    var cards = get(obj, 'data.cardList');
    if (Array.isArray(cards)) {
      var kept = [];
      for (var i = 0; i < cards.length; i++) {
        var card = cards[i];
        if (!isObj(card) || !PROFILE_CARDS[card.dataKey]) continue;
        var content = card.content;
        if (isObj(content)) {
          var lists = [['entranceList_1', ENTRANCE_1], ['entranceList_2', ENTRANCE_2]];
          for (var j = 0; j < lists.length; j++) {
            var list = content[lists[j][0]];
            var allow = lists[j][1];
            if (!Array.isArray(list)) continue;
            content[lists[j][0]] = list.filter(function (it) {
              return isObj(it) && allow[String(it.id)];
            });
          }
        }
        kept.push(card);
      }
      setPath(obj, 'data.cardList', kept);
      stat.changed++;
    }
    return genericClean(obj, stat);
  }

  /* 搜索联想：过滤运营/广告 tip。sp 是 sponsored（付费推广），要删。 */
  var TIP_DROP_TASK_TAGS = {
    'ad': 1, 'sp': 1,
    'exct_query_sug_merge_theme': 1, 'query_sug_merge_theme': 1
  };
  var TIP_DROP_RESULT_TYPES = { 'ad': 1, 'poi_ad': 1, 'toplist': 1 };
  var TIP_DROP_DATATYPE = { '12': 1 };

  function isAdTip(item) {
    var tip = isObj(item) && isObj(item.tip) ? item.tip : null;
    if (!tip) return false;
    if (TIP_DROP_DATATYPE[String(tip.datatype_spec)]) return true;
    if (TIP_DROP_RESULT_TYPES[tip.result_type]) return true;
    return !!TIP_DROP_TASK_TAGS[tip.task_tag];
  }

  function filterTips(list) {
    if (!Array.isArray(list)) return null;
    var kept = list.filter(function (t) { return !isAdTip(t); });
    return kept.length === list.length ? null : kept;
  }

  function cleanSearchTips(obj, stat) {
    var changed = false;
    var tips = obj.tip_list || get(obj, 'data.tip_list');
    var kept = filterTips(tips);
    if (kept) {
      if (obj.tip_list) obj.tip_list = kept;
      else setPath(obj, 'data.tip_list', kept);
      changed = true;
    }
    /* 城市搜索场景是 city_list[].tip_list 两层结构 */
    var cities = obj.city_list || get(obj, 'data.city_list');
    if (Array.isArray(cities)) {
      for (var i = 0; i < cities.length; i++) {
        if (!isObj(cities[i])) continue;
        var k = filterTips(cities[i].tip_list);
        if (k) {
          cities[i].tip_list = k;
          changed = true;
        }
      }
    }
    if (changed) stat.changed++;
    return genericClean(obj, stat);
  }

  /* 地点详情页：默认按「删除清单」处理（比白名单安全，不会误删未知的有用模块）。
   * 清单来自 RuCu6 amap.js（2024-10-15）里 /shield/search/poi/detail 的模块列表，
   * 已剔除评论、编辑入口、反馈、上传照片、营业信息等正常功能模块。 */
  var POI_DROP_MODULES = [
    'CouponBanner', 'adv_compliance_info', 'adv_gift', 'bigListBizRec',
    'bottomDescription', 'brand_shop_bar', 'checkIn', 'check_in',
    'cityCardFeed', 'city_discount', 'claim', 'co_branded_card',
    'collector_guide', 'common_coupon_bar', 'common_coupon_card',
    'cpt_service_shop', 'dayTripList', 'discount_commodity',
    'divergentRecommendModule', 'everyOneToSee', 'first_surround_estate_tab',
    'horizontalGoodsShelf', 'hotPlay', 'hot_new_house_estate', 'hot_shop',
    'hotelCoupon', 'hotelList', 'houseList', 'houseOfficeBrandIntroduction',
    'houseOfficeInfo', 'houseOfficeNotice', 'houseOfficeService', 'houseShelf',
    'house_apart_info', 'house_buying_agent', 'house_coupon', 'house_cp_clues',
    'house_cpt_coupon', 'house_cpt_grab', 'house_price', 'house_price_v2',
    'house_rent_sale_agency', 'image_banner', 'kaMarketingCampaign',
    'kaProductMixServiceShelf', 'ka_not_enter', 'legSameIndustryRecEntrance',
    'listBizRec_1', 'listBizRec_2', 'matrix_banner', 'merchantSettlement',
    'membership', 'mini_hook_shelf', 'movie_info', 'nearbyGoodCar',
    'nearbyRecommendModule', 'nearby_house', 'nearby_new_house_estate',
    'nearby_office_estate', 'nearby_old_sell_estate', 'nearby_play_rec',
    'newGuest', 'newRelatedRecommends', 'new_operation_banner', 'newsellhouse',
    'officerenthouse', 'officesellhouse', 'official_account', 'oldsellhouse',
    'operation_banner', 'operator_card', 'packageShelf', 'parentBizRec',
    'parentPoiRecEntrance', 'platformCustomerCommonModule',
    'platformCustomerComplianceInfo', 'poiDetailWaterFeed',
    'poiDetailWaterFeedTitle', 'poster_banner', 'portal_entrance', 'quickLink',
    'relatedRecommends', 'renthouse', 'rentSaleHouse', 'rentsaleagencyv2',
    'rentsaleagencyv3', 'rentsalehouse', 'residentialOwners',
    'sameIndustryRecommendModule', 'sameIndustry2RecommendModule',
    'scenic_coupon', 'scenic_filter', 'scenic_lifeservices', 'scenic_mustplay',
    'scenic_play_guide', 'scenic_recommend', 'scenic_voice', 'searchPlaMap',
    'second_surround_estate_tab', 'service_shop', 'shopBaseCase',
    'smallListBizRec', 'smallOrListBizRec', 'surroundHouseTab',
    'surroundOldSellHouse', 'surroundRentHouse', 'surround_facility',
    'surround_facility_new', 'surround_house_tab', 'surround_oldsellhouse',
    'surround_renthouse', 'surround_rentoffice', 'surround_selloffice',
    'thirdparty_info', 'travelGuideRec', 'waistRecEntrance', 'waterFallFeed',
    'waterFallFeedTitle'
  ];

  /* 即使出现在删除清单里也保留：正常内容与功能入口。 */
  var POI_KEEP_ALWAYS = {
    'reviews': 1, 'comprehensiveEditEntrance': 1, 'feedback': 1,
    'verification': 1, 'uploadBar': 1, 'upload_bar': 1, 'contributor': 1,
    'multi_page_anchor': 1, 'hotelMustRead': 1, 'legal_document': 1
  };

  function dropPoiModules(obj, stat) {
    var m = get(obj, 'data.modules');
    if (!isObj(m)) return;
    for (var i = 0; i < POI_DROP_MODULES.length; i++) {
      var k = POI_DROP_MODULES[i];
      if (POI_KEEP_ALWAYS[k]) continue;
      if (Object.prototype.hasOwnProperty.call(m, k)) {
        delete m[k];
        stat.removed++;
      }
    }
  }

  /* 地点详情页：上游 jq 的保留模块白名单（POI_DETAIL_STRICT=true 时才用） */
  var POI_KEEP_MODULES = [
    'baseInfo', 'poiDetailCommonConfig', 'navbarMore', 'backToTop',
    'poiDetailBottomBar', 'poiMapModule', 'anchor',
    'reSortContentAndSimilar', 'comprehensiveEditEntrance', 'functionZone',
    'poiTipBar', 'floatTelButton', 'footer_tel_button', 'footer_retain_button',
    'attractGalleryInfo', 'combineReviews', 'evaluateVO', 'reviews',
    'inviteReview', 'seriousPublicExperience', 'societyPublicExperience',
    'poiDetailRankUpCard', 'travelGuideAndQa', 'poiDetailAQModule',
    'AIStreetTips', 'expertNote', 'recommend_food', 'shopNews', 'mallNews',
    'shopBaseCase', 'wikiInfo', 'wikiInfoBelow', 'poiDetailNote',
    'poiDetailWikiAndLOI', 'human_traffic', 'floorGuideGbf',
    'houseEvaluationInfo', 'residentialOwnersVO', 'realtorRealStep',
    'houseOfficeInfo', 'houseOfficeService', 'houseOfficeBrandIntroduction',
    'houseOfficeNotice', 'newHouseDetailInfo', 'house_apart_info',
    'scenic_mustplay', 'hotelGraphicDetail', 'homestayGraphicDetail',
    'hotelFacilities', 'hotelMustRead', 'shoppingMallEvent',
    'enhanceIMQuestions', 'enhanceCustomerServicePoiModule', 'aiAgentFooterBar',
    'imBottomGuide', 'enhanceCustomerServiceFixedBottom', 'shopBasePerson',
    'shopServiceBffvo', 'service_process', 'shopCourseList',
    'poiDetailJobList', 'jobRec', 'shop_vip_card', 'shopStdActivity',
    'privateSphereChannel', 'kaShopService', 'ka_not_enter',
    'company1688Info', 'thirdparty_info', 'expressEntryCard',
    'poi_intercept', 'aiAgentEntry', 'commonAiAgent', 'poiCardAiAgentEntryV2',
    'storeDirections', 'shopFindWayGuide', 'shopQualifications',
    'businessQualifications', 'legal_document', 'home_legal_document',
    'rec_legal_document', 'business_scope', 'governmentInformation',
    'official_account', 'merchantSettlement', 'shop_settlement',
    'scenic_ticket', 'movieBookingShelf', 'hotelRooms', 'ktvBookingShelf',
    'venueBookingShelfModule', 'reserveShelf', 'DinnerBottomBar',
    'poiDetailAppointmentRegister'
  ];

  function filterModuleRefs(list) {
    if (!Array.isArray(list)) return list;
    return list.filter(function (v) {
      return typeof v !== 'string' || POI_KEEP_MODULES.indexOf(v) !== -1;
    });
  }

  function trimPoiDetail(obj) {
    var data = obj.data;
    if (!isObj(data)) return;
    if (isObj(data.regions)) {
      var keys = Object.keys(data.regions);
      for (var i = 0; i < keys.length; i++) {
        data.regions[keys[i]] = filterModuleRefs(data.regions[keys[i]]);
      }
    }
    if (isObj(data.modules)) {
      var mkeys = Object.keys(data.modules);
      for (var j = 0; j < mkeys.length; j++) {
        if (POI_KEEP_MODULES.indexOf(mkeys[j]) === -1) delete data.modules[mkeys[j]];
      }
    }
    var hidden = get(data, 'meta.half_hidden_modules');
    if (Array.isArray(hidden)) setPath(data, 'meta.half_hidden_modules', filterModuleRefs(hidden));
    var user = get(data, 'modules.baseInfo.data.user');
    if (isObj(user)) {
      delete user.userLocRgeo;
      delete user.homeInfo;
      delete user.companyInfo;
    }
    var anchors = get(data, 'modules.anchor.data.items');
    if (Array.isArray(anchors)) {
      setPath(data, 'modules.anchor.data.items', anchors.filter(function (a) {
        if (!isObj(a) || !Array.isArray(a.anchor)) return false;
        return a.anchor.some(function (r) {
          return typeof r === 'string' && POI_KEEP_MODULES.indexOf(r) !== -1;
        });
      }));
    }
    var panels = get(data, 'modules.poiDetailCommonConfig.data.swipeUpPanelConfig.swipeUpPanelTextList');
    if (Array.isArray(panels)) {
      setPath(data, 'modules.poiDetailCommonConfig.data.swipeUpPanelConfig.swipeUpPanelTextList',
        panels.filter(function (p) {
          if (!isObj(p) || !Array.isArray(p.modulesMap)) return true;
          return p.modulesMap.some(function (r) {
            return typeof r === 'string' && POI_KEEP_MODULES.indexOf(r) !== -1;
          });
        }));
    }
  }

  function cleanPoiDetail(obj, stat) {
    stat.removed += delPaths(obj, [
      'data.modules.combineReviews.data.write_comment.btnRightTag',
      'data.modules.combineReviews.data.write_comment.title'
    ]);
    if (POI_DETAIL_STRICT) trimPoiDetail(obj);   // 激进：按白名单裁剪
    else dropPoiModules(obj, stat);              // 默认：只删广告模块
    return genericClean(obj, stat);
  }

  /* 打车页卡片 / 弹窗 */
  function cleanRideCards(obj, stat) {
    stat.removed += delPaths(obj, [
      'data.lubanData.skin', 'data.lubanData.kingToolBoxBubble',
      'data.lubanData.popup', 'data.lubanData.banner'
    ]);
    return genericClean(obj, stat);
  }

  /* 附近信息流 */
  function cleanNearby(obj, stat) {
    stat.removed += delPaths(obj, ['data.operation_activity']);
    return genericClean(obj, stat);
  }

  /* 搜索业务 marketingOperationStructured（原 Body Rewrite 三条 jq） */
  function cleanMarketing(obj, stat) {
    stat.removed += delPaths(obj, [
      'data.commonMaterial', 'data.tipsOperationLocation', 'data.resourcePlacement'
    ]);
    return obj;
  }

  /* 搜索首页 / 打车详情页气泡（原 Body Rewrite 两条 jq） */
  function cleanPoiHomepage(obj, stat) {
    stat.removed += delPaths(obj, ['history_tags']);
    return obj;
  }
  function cleanTaxiTips(obj, stat) {
    stat.removed += delPaths(obj, ['data.carTips.data.popupInfo']);
    return obj;
  }

  /* 工具宫格：清掉角标 tips（上游 lpx 的 opc/tools/list） */
  function cleanToolList(obj, stat) {
    var cats = get(obj, 'data.category');
    if (Array.isArray(cats)) {
      for (var i = 0; i < cats.length; i++) {
        var tools = isObj(cats[i]) ? cats[i].tools : null;
        if (!Array.isArray(tools)) continue;
        for (var j = 0; j < tools.length; j++) {
          if (isObj(tools[j]) && 'tips' in tools[j]) {
            delete tools[j].tips;
            stat.removed++;
          }
        }
      }
    }
    return genericClean(obj, stat);
  }

  /* ---- 以下为逐接口专项，来自 RuCu6 amap.js（2024-10-15）的字段级处理 ---- */

  /* 搜索页底部结果上方窄横幅（search_poi/tips_operation_location） */
  var TIPS_OP_MODULES = [
    'belt', 'common_float_bar', 'common_image_banner',
    'coupon_discount_float_bar', 'coupon_float_bar', 'discount_coupon',
    'image_cover_bar', 'mood_coupon_banner', 'operation_brand',
    'promotion_wrap_card', 'tips_top_banner'
  ];

  function cleanTipsOperationLocation(obj, stat) {
    if (del(obj, 'data.coupon')) stat.removed++;
    dropKeys(get(obj, 'data.modules'), TIPS_OP_MODULES, stat);
    return genericClean(obj, stat);
  }

  /* 搜索结果列表（search_poi/mps、search_poi/search/sp）。
   * 注意它和 search_poi/sug 是两种结构：这里是 list_data 搜索结果，不是 tip_list。 */
  var SEARCH_AD_CARDS = { 'SearchCardBrand': 1, 'NearbyGroupBuy': 1, 'ImageBanner': 1 };
  var SEARCH_AD_ITEM_TYPES = { 'brandAdCard': 1, 'toplist_al': 1 };

  function cleanOneSearchItem(list, stat) {
    if (!isObj(list)) return;
    var hook = get(list, 'hookInfo.data');
    if (isObj(hook)) stat.removed += delPaths(hook, ['header', 'house_info']);
    stat.removed += delPaths(list, [
      'map_bottom_bar.hotel',
      'poi.item_info.tips_bottombar_button.hotel',
      'map.main_point',
      'tips_operation_info',
      'bottom.bottombar_button.hotel'
    ]);
    if (isObj(list.card) && SEARCH_AD_CARDS[list.card.card_id]) {
      delete list.card;
      stat.removed++;
    }
    if (Array.isArray(list.content)) {
      var kept = list.content.filter(function (it) {
        return !(isObj(it) && SEARCH_AD_ITEM_TYPES[it.item_type]);
      });
      if (kept.length !== list.content.length) {
        list.content = kept;
        stat.changed++;
      }
    }
  }

  function cleanSearchList(obj, stat) {
    var a = get(obj, 'data.list_data.content');
    if (Array.isArray(a)) cleanOneSearchItem(a[0], stat);
    var b = get(obj, 'data.district.poi_list');
    if (Array.isArray(b) && isObj(b[0])) {
      stat.removed += delPaths(b[0], ['transportation', 'feed_rec_tab']);
    }
    cleanOneSearchItem(get(obj, 'data.modules.not_parse_result.data.list_data.content.0'), stat);
    var d = get(obj, 'data.modules.list_data.data');
    if (isObj(d) && Array.isArray(d.content)) cleanOneSearchItem(d, stat);
    return genericClean(obj, stat);
  }

  /* 路线规划页（card-service-plan-home）：带 schema 的 children 是推广位 */
  function cleanRoutePlanHome(obj, stat) {
    if (filterArrayAt(obj, 'data.children', function (it) {
      return !(isObj(it) && Object.prototype.hasOwnProperty.call(it, 'schema'));
    })) stat.changed++;
    return genericClean(obj, stat);
  }

  /* 导航中 / 路线规划（perception/drive/routeInfo 与 routePlan） */
  var DRIVE_PLAN_DROP = ['assistant', 'global_guide_data', 'route_search', 'start_button_tips'];

  function isAdDynamic(it) {
    return isObj(it) && /ads-\d+/.test(String(it.dynamic_id_s));
  }

  function cleanDriveRoute(obj, stat, isPlan) {
    var fe = get(obj, 'data.front_end');
    if (isObj(fe)) {
      if (isPlan) {
        dropKeys(fe, DRIVE_PLAN_DROP, stat);
      } else if (Object.prototype.hasOwnProperty.call(fe, 'assistant')) {
        delete fe.assistant;               // 助手皮肤 / 左上角悬浮动图
        stat.removed++;
      }
      if (!isPlan && Array.isArray(fe.guide_tips)) {
        var tips = fe.guide_tips.filter(function (it) {
          return !(isObj(it) && it.biz_type === 'music');   // 音乐底栏推广
        });
        if (tips.length !== fe.guide_tips.length) {
          fe.guide_tips = tips;
          stat.changed++;
        }
      }
      if (Array.isArray(fe.download)) {      // 导航插播语音广告
        var dl = fe.download.filter(function (it) { return !isAdDynamic(it); });
        if (dl.length !== fe.download.length) {
          fe.download = dl;
          stat.changed++;
        }
      }
    }
    var ev = get(obj, 'data.tbt.event');
    if (Array.isArray(ev)) {
      var kept = ev.filter(function (it) { return !isAdDynamic(it); });
      if (kept.length !== ev.length) {
        setPath(obj, 'data.tbt.event', kept);
        stat.changed++;
      }
    }
    return genericClean(obj, stat);
  }
  function cleanDriveRouteInfo(obj, stat) { return cleanDriveRoute(obj, stat, false); }
  function cleanDriveRoutePlan(obj, stat) { return cleanDriveRoute(obj, stat, true); }

  /* 公交列表（bus/plan/integrate） */
  function cleanBusIntegrate(obj, stat) {
    var bl = get(obj, 'data.banner_lists');
    if (isObj(bl)) {
      if (Array.isArray(bl.data)) { bl.data = []; stat.changed++; }
      if (Array.isArray(bl.tips)) { bl.tips = []; stat.changed++; }
    }
    var tp = get(obj, 'data.mixed_plans.data.taxiPlans');
    if (Array.isArray(tp)) {
      setPath(obj, 'data.mixed_plans.data.taxiPlans', []);
      stat.changed++;
    }
    /* 不能走 genericClean：键名 banner_lists 会被通用广告词匹配整块删掉，
     * 导致公交列表结构缺失。本接口的广告只有上面两处，清空即可。 */
    return obj;
  }

  /* 导航前页面（aos/perception/publicTravel/beforeNavi） */
  function cleanBeforeNavi(obj, stat) {
    var cd = get(obj, 'data.common_data');
    if (isObj(cd)) {
      var names = ['bus_plan_bottom_event', 'bus_plan_segment_event'];
      for (var i = 0; i < names.length; i++) {
        var ev = cd[names[i]];
        if (isObj(ev) && Array.isArray(ev.data)) {
          ev.data = [];
          stat.changed++;
        }
      }
    }
    var fe = get(obj, 'data.front_end');
    if (isObj(fe) && Array.isArray(fe.assistant)) {
      fe.assistant = [];
      stat.changed++;
    }
    return genericClean(obj, stat);
  }

  /* 酒店 / 民宿 / 景区门票页（c3frontend/af-hotel/page/main） */
  function cleanHotelPage(obj, stat) {
    var m = get(obj, 'data.modules');
    if (isObj(m)) {
      dropKeys(m, ['CouponPortalCard', 'CouponWidget', 'recommended_list'], stat);
      var uf = m.user_filter_card;
      if (isObj(uf) && isObj(uf.data)) {
        dropKeys(uf.data, ['banner', 'bannerList', 'service_data', 'sug_items_data'], stat);
        stat.removed += delPaths(uf.data, ['search_button_data.rightbgText']);
      }
    }
    return genericClean(obj, stat);
  }

  /* 步行导航结束页（c3frontend/af-launch/page/main） */
  function cleanEndNaviLaunch(obj, stat) {
    var p = 'data.modules.C1EndNaviEngine.data';
    if (isObj(get(obj, p))) {
      setPath(obj, p, {});
      stat.changed++;
    }
    return genericClean(obj, stat);
  }

  /* 附近页（shield/search/nearbyrec_smart）：只保留搜索框与推荐流。
   * 返回 {} 会让附近页空白，所以按模块白名单裁而不是整包清空。 */
  var NEARBY_KEEP_MODULES = ['head', 'search_hot_words', 'feed_rec'];

  function cleanNearbyModules(obj, stat) {
    var m = get(obj, 'data.modules');
    if (Array.isArray(m) && m.every(function (x) { return typeof x === 'string'; })) {
      var kept = m.filter(function (x) { return NEARBY_KEEP_MODULES.indexOf(x) !== -1; });
      if (kept.length !== m.length) {
        setPath(obj, 'data.modules', kept);
        stat.changed++;
      }
    }
    return genericClean(obj, stat);
  }

  /* =====================================================================
   * 三、URL 分派表
   * ===================================================================== */

  /* 规则名 -> 功能开关名。开关关掉时该规则整条跳过，请求原样放行。
   * 名字对不上（写错一个字）就会静默失效，所以 verify.js 会校验两张表里的
   * 每个 name 都必须在这里出现。 */
  var KEY_GROUPS = {
    splash: ['开屏广告'],
    home: ['首页配置中心', '首页主体', '首页资源位', '产品推广列表',
      '榜单卡片', '天气挂件', '提示与通知'],
    search: ['搜索热词', '搜索栏推广词', '订单列表推广', '搜索页广告位',
      '场景推荐', '搜索业务结构化', '搜索首页', '搜索联想词',
      '搜索中间层联想', '搜索结果列表', '搜索页横幅', '搜索页快捷入口'],
    nearby: ['附近页模块', '附近信息流', '附近页'],
    route: ['导航结束卡片', '导航前页面', '导航中路线信息', '驾车路线规划',
      '路线规划页卡片', '公交列表', '步行导航结束页'],
    taxi: ['通勤卡片', '打车评价与气泡', '打车红点与角标', '打车详情页气泡',
      '打车页卡片', '打车顺风车卡片', '打车友好提示', '支付成功页推广'],
    poi: ['地点详情', '优惠券信息', '酒店与门票页'],
    profile: ['我的页面'],
    banner: ['横幅列表', 'AI 推荐', '消息盒推广'],
    tools: ['工具宫格', '转化列表']
  };

  var RULE_KEY = {};
  (function buildRuleKey() {
    for (var key in KEY_GROUPS) {
      if (!Object.prototype.hasOwnProperty.call(KEY_GROUPS, key)) continue;
      var names = KEY_GROUPS[key];
      for (var i = 0; i < names.length; i++) RULE_KEY[names[i]] = key;
    }
  })();

  function ruleOn(item) {
    var key = RULE_KEY[item.name];
    return key ? flagOn(key) : true;   // 未登记的名字按开启处理，不会静默丢功能
  }

  /* http-request 阶段直接返回 {} 的纯广告接口（原 [Map Local] + 新版补充） */
  var MOCK_URLS = [
    { name: '开屏广告', re: /^https:\/\/m5\.amap\.com\/ws\/valueadded\/alimama\/splash_screen\?/ },
    { name: '通勤卡片', re: /^https:\/\/m5-zb\.amap\.com\/ws\/ride\/home\/page\/get_commuting_card\?/ },
    { name: '订单列表推广', re: /^https:\/\/m5\.amap\.com\/ws\/shield\/search_business\/process\/orderList\?/ },
    { name: '搜索热词', re: /^https:\/\/m5\.amap\.com\/ws\/shield\/search\/new_hotword\?/ },
    { name: '导航结束卡片', re: /^https:\/\/m5\.amap\.com\/ws\/faas\/amap-navigation\/card-service-(?:car-end|route-plan)/ },
    { name: '搜索页广告位', re: /^https:\/\/m5\.amap\.com\/ws\/shield\/search_poi\/tips_adv\?/ },
    { name: '横幅列表', re: /^https:\/\/oss\.amap\.com\/ws\/banner\/lists\/\?/ },
    { name: 'AI 推荐', re: /^https:\/\/ai\.amap\.com\/v1\/ai_rec\// },
    { name: '产品推广列表', re: /^https:\/\/m5\.amap\.com\/ws\/aos\/main\/page\/product\/list\?/ },
    { name: '首页资源位', re: /^https:\/\/m5\.amap\.com\/ws\/faas\/amap-navigation\/(?:main-page-assets|main-page-aiqs|main-page-location|ridewalk-end-fc|usr-profile-fc\/homeV2)/ },
    { name: '提示与通知', re: /^https:\/\/m5\.amap\.com\/ws\/(?:mapapi\/hint_text\/offline_data|message\/notice\/list)/ },
    { name: '场景推荐', re: /^https:\/\/m5\.amap\.com\/ws\/shield\/scene\/recommend\?/ },
    { name: '天气挂件', re: /^https:\/\/m5\.amap\.com\/ws\/valueadded\/weather\/v2\?/ },
    { name: '消息盒推广', re: /^https:\/\/sns\.amap\.com\/ws\/msgbox\/pull_mp\?/ },
    { name: '打车评价与气泡', re: /^https:\/\/m5-zb\.amap\.com\/ws\/boss\/(?:order\/car\/(?:feedback\/get_card_questions|feedback\/viptips|king_toolbox_car_bubble|remark\/satisfactionConf|rights_information)|tips\/onscene_visual_optimization)/ },
    { name: '支付成功页推广', re: /^https:\/\/m5-zb\.amap\.com\/ws\/boss\/(?:pay\/web\/paySuccess\/info\/request|transportation\/diversion\/resource\/driving)/ },
    { name: '打车红点与角标', re: /^https:\/\/m5-zb\.amap\.com\/ws\/promotion-web\/resource(?:\/home)?\?/ },
    { name: '榜单卡片', re: /^https:\/\/m5\.amap\.com\/ws\/info_bff\/rankingCard\?/ },
    { name: '搜索栏推广词', re: /^https:\/\/m5\.amap\.com\/ws\/shield\/search_bff\/hotword\?/ }
  ];

  /* http-response 阶段清洗规则：第一个命中即执行 */
  var CLEANERS = [
    { name: '首页配置中心', re: /^https:\/\/m5\.amap\.com\/ws\/shield\/frogserver\/aocs\/updatable\/1\?/, fn: cleanHomeConfig },
    { name: '我的页面', re: /^https:\/\/m5\.amap\.com\/ws\/shield\/dsp\/profile\/index\/nodefaasv3\?/, fn: cleanProfile },
    { name: '搜索业务结构化', re: /^https:\/\/m5\.amap\.com\/ws\/shield\/search_business\/process\/marketingOperationStructured\?/, fn: cleanMarketing },
    { name: '搜索首页', re: /^https:\/\/m5\.amap\.com\/ws\/shield\/search_poi\/homepage\?/, fn: cleanPoiHomepage },
    { name: '打车详情页气泡', re: /^https:\/\/m5-zb\.amap\.com\/ws\/sharedtrip\/taxi\/order_detail_car_tips\?/, fn: cleanTaxiTips },
    /* 以下三条必须分开：sug 是联想词（tip_list），mps/search/sp 是搜索结果列表 */
    { name: '搜索联想词', re: /^https:\/\/(?:m5|info)\.amap\.com\/ws\/shield\/search_poi\/sug/, fn: cleanSearchTips },
    { name: '搜索结果列表', re: /^https:\/\/(?:m5|info)\.amap\.com\/ws\/shield\/search_poi\/(?:mps|search\/sp)/, fn: cleanSearchList },
    { name: '搜索页横幅', re: /^https:\/\/(?:m5|info)\.amap\.com\/ws\/shield\/search_poi\/tips_operation_location/, fn: cleanTipsOperationLocation },
    { name: '搜索中间层联想', re: /^https:\/\/info\.amap\.com\/ws\/shield\/search_business\/process\/middleLayer\/sug\?/, fn: cleanSearchTips },
    { name: '地点详情', re: /^https:\/\/(?:info|m5)\.amap\.com\/ws\/shield\/search\/poi\/detail/, fn: cleanPoiDetail },
    { name: '优惠券信息', re: /^https:\/\/(?:info|m5)\.amap\.com\/ws\/shield\/search\/common\/coupon\/info/, fn: emptyBody },
    { name: '工具宫格', re: /^https:\/\/sns\.amap\.com\/ws\/opc\/tools\/list\?/, fn: cleanToolList },
    { name: '打车页卡片', re: /^https:\/\/m5-zb\.amap\.com\/ws\/boss\/car\/order\/content_info\?/, fn: cleanRideCards },
    { name: '打车顺风车卡片', re: /^https:\/\/m5-zb\.amap\.com\/ws\/amap\/hitch\/passenger\/content_info\?/, fn: cleanRideCards },
    { name: '打车友好提示', re: /^https:\/\/m5-zb\.amap\.com\/ws\/boss\/order_web\/friendly_information/, fn: emptyBody },
    { name: '附近页模块', re: /^https:\/\/m5\.amap\.com\/ws\/shield\/search\/nearbyrec_smart\?/, fn: cleanNearbyModules },
    { name: '附近信息流', re: /^https:\/\/m5\.amap\.com\/ws\/smartui\/near_recommend\?/, fn: cleanNearby },
    /* c3frontend 三种页面结构完全不同，不能共用通用清理 */
    { name: '酒店与门票页', re: /^https:\/\/m5\.amap\.com\/ws\/c3frontend\/af-hotel\/page\/main/, fn: cleanHotelPage },
    { name: '步行导航结束页', re: /^https:\/\/m5\.amap\.com\/ws\/c3frontend\/af-launch\/page\/main/, fn: cleanEndNaviLaunch },
    { name: '附近页', re: /^https:\/\/m5\.amap\.com\/ws\/c3frontend\/af-nearby\/nearby/, fn: genericClean },
    { name: '搜索页快捷入口', re: /^https:\/\/info\.amap\.com\/ws\/c3frontend\/af-search\/search\?/, fn: genericClean },
    { name: '导航前页面', re: /^https:\/\/m5\.amap\.com\/ws\/aos\/perception\/publicTravel\/beforeNavi\?/, fn: cleanBeforeNavi },
    { name: '公交列表', re: /^https:\/\/m5\.amap\.com\/ws\/bus\/plan\/integrate\?/, fn: cleanBusIntegrate },
    { name: '导航中路线信息', re: /^https:\/\/m5\.amap\.com\/ws\/perception\/drive\/routeInfo/, fn: cleanDriveRouteInfo },
    { name: '驾车路线规划', re: /^https:\/\/m5\.amap\.com\/ws\/perception\/drive\/routePlan/, fn: cleanDriveRoutePlan },
    { name: '路线规划页卡片', re: /^https:\/\/m5\.amap\.com\/ws\/faas\/amap-navigation\/card-service-plan-home/, fn: cleanRoutePlanHome },
    { name: '首页主体', re: /^https:\/\/m5\.amap\.com\/ws\/faas\/amap-navigation\/main-page/, fn: genericClean },
    { name: '转化列表', re: /^https:\/\/center\.amap\.com\/ws\/amc\/server\/conv\/raise_list\?/, fn: genericClean }
  ];

  function matchUrl(list, u) {
    for (var i = 0; i < list.length; i++) {
      if (!ruleOn(list[i])) continue;   // 该分类被参数关掉了，跳过
      if (list[i].re.test(u)) return list[i];
    }
    return null;
  }

  /* =====================================================================
   * 四、入口
   * ===================================================================== */
  try {
    var url = (typeof $request !== 'undefined' && $request && $request.url) || '';
    /* Surge 官方提供 $script.type；部分第三方内核不提供，
     * 这时以 $response 是否存在来区分阶段。两者都判不到就按 request 处理。 */
    var scriptType = (typeof $script !== 'undefined' && $script && $script.type) || '';
    var isResponsePhase = scriptType === 'http-request' ? false
      : (scriptType === 'http-response' ||
         (typeof $response !== 'undefined' && $response !== null));

    if (!isResponsePhase) {
      /* ---- http-request：纯广告接口根本不发出去 ---- */
      /* mock=0 时不拦截，让请求照常发出、响应也原样放行（等于整类保留） */
      var mock = flagOn('mock') ? matchUrl(MOCK_URLS, url) : null;
      if (mock) {
        log('[request] 拦截 ' + mock.name + ' -> ' + url);
        done({
          response: {
            status: 200,
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
            body: EMPTY_BODY
          }
        });
      } else {
        done();
      }
      return;
    }

    /* ---- http-response：字段级清洗 ---- */
    if (matchUrl(MOCK_URLS, url)) {
      done();                        // 已在请求阶段 mock，响应无需再处理
      return;
    }
    var rule = matchUrl(CLEANERS, url);
    if (!rule) {
      done();                        // 未命中规则，原样放行
      return;
    }

    var raw = $response && $response.body;
    if (typeof raw !== 'string' || !raw.trim()) {
      log('[response] ' + rule.name + ' 无文本 body，放行');
      done();
      return;
    }

    var obj;
    try {
      obj = JSON.parse(raw);
    } catch (e) {
      log('[response] ' + rule.name + ' 非 JSON，放行');
      done();
      return;
    }
    if (!isObj(obj) && !Array.isArray(obj)) {
      done();
      return;
    }

    var stat = { removed: 0, changed: 0, nodes: 0 };
    var result = rule.fn(obj, stat);
    if (result === undefined) {
      done();
      return;
    }
    var body = result === null ? EMPTY_BODY : JSON.stringify(result);
    log('[response] ' + rule.name + ' 删除 ' + stat.removed +
        ' 项 / 改写 ' + stat.changed + ' 项 / 扫描 ' + stat.nodes + ' 节点');
    done({ body: body });
  } catch (err) {
    log('异常，原样放行: ' + (err && err.message ? err.message : err));
    done();                          // 兜底：绝不中断业务请求
  }
})();
