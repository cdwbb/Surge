/* 高德地图去广告_open —— amap_remove_ads_open.js
 * 另一套独立实现：接口清单与清洗策略与 js/amap_remove_ads_work.js 不同，两套模块不要同时启用。
 * 由 amap_remove_ads_open.sgmodule 的 14 条 [Script] 通过 raw URL 远程引用，Surge 自动缓存；
 * 不依赖 kelee.one，也不需要把本文件下载到本机。
 * 开关：模块用 #!arguments 暴露 9 个中文参数，1 开 0 关；由 [Script] 的
 * argument= 传入，脚本用 $argument 解析，缺省一律按开处理（输出日志默认关）。
 * 参数只控制脚本改写；模块里的静态规则段不受参数影响。
 * 覆盖：开屏 / 首页 / 搜索 / 附近 / 我的 / 路线规划 / 导航 / 打车 / POI 详情页 的推广清理。
 * 原理：对 http-response 的 JSON 按接口分支做字段删减与列表过滤，不阻断正常功能数据。
 */

/* Surge 的 JSC 引擎不保证允许顶层 return，整个处理主体包进 IIFE，
 * 既保证提前退出语法合法，也避免声明泄漏到全局。
 */
(function main() {
// ---- 参数开关 ---------------------------------------------------------------
/* $argument 由模块 [Script] 的 argument= 传入，形如
 * 「splash=1&home=0&log=1」，用 & 分隔而不是逗号（[Script] 参数本身逗号分隔）。
 * 中文参数名与英文键都认；未传的开关一律按「开」处理，只有 log 默认关。 */
const ARG_ALIAS = {
  "开屏广告": "splash", splash: "splash",
  "首页推广": "home", home: "home",
  "搜索推广": "search", search: "search",
  "附近推荐": "nearby", nearby: "nearby",
  "路线导航": "route", route: "route",
  "打车推广": "taxi", taxi: "taxi",
  "地点详情": "poi", poi: "poi",
  "我的页面": "profile", profile: "profile",
  "输出日志": "log", log: "log"
};
const ARG_OFF = { "0": 1, "false": 1, "off": 1, "no": 1 };
const ARG_DEFAULT_OFF = { log: 1 };
const ARGS = {};
(function parseArgs() {
  const raw = (typeof $argument === "string" && $argument) || "";
  if (!raw) return;
  for (const part of raw.split("&")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const k = part.slice(0, eq).replace(/\s+/g, "");
    if (!k) continue;
    ARGS[ARG_ALIAS[k] || k] = part.slice(eq + 1).replace(/\s+/g, "").toLowerCase();
  }
})();
// 缺省全开，只有 输出日志 默认关；老配置少传参数也不会丢功能
const on = (key) => Object.prototype.hasOwnProperty.call(ARGS, key)
  ? !ARG_OFF[ARGS[key]]
  : !ARG_DEFAULT_OFF[key];
const DEBUG = on("log");
const log = (msg) => {
  if (DEBUG && typeof console !== "undefined" && console.log) {
    console.log("[AmapOpen] " + msg);
  }
};
let dirty = false;

// ---- 工具函数 ---------------------------------------------------------------

// safe delete：对象链上任一环节不存在也不会抛错
function del(target, ...keys) {
  if (target == null) return;
  for (const k of keys) {
    try {
      delete target[k];
    } catch (e) {}
  }
}

// safe clear：把数组/字段清空，仅当它存在且非空
function reset(target, key, value) {
  if (target == null) return;
  const cur = target[key];
  if (cur == null) return;
  if (Array.isArray(cur)) {
    if (cur.length > 0) target[key] = value || [];
  } else if (cur !== value) {
    target[key] = value;
  }
}

/* URL 归一化：
 * 1. 解码 %40command%3A 之类的编码
 * 2. 把「@command:」统一折算成路径斜杠，里约 URL 形如
 *    /ws/boss/order_web@command:friendly_information -> /ws/boss/order_web/friendly_information
 *    这样所有分支都能用纯路径子串匹配。
 */
function normalize(url) {
  let out = url || "";
  try {
    out = decodeURIComponent(out);
  } catch (e) {}
  out = out.replace(/@command:\//gi, "/"); // 防御 @command:/ 形态
  out = out.replace(/@command:/gi, "/");
  return out;
}

const has = (url, s) => url.indexOf(s) !== -1;

// 各推广位通用的模块键名清单（POI 详情页）
const POI_DETAIL_MODULES = [
  "CouponBanner", // 高德红包
  "adv_compliance_info", // 服务提供方
  "adv_gift",
  "bigListBizRec", // 周边景点推荐
  "bottomDescription", // 底部描述
  "brand_shop_bar",
  "checkIn",
  "check_in", // 足迹打卡
  "cityCardFeed", // 景点卡片
  "city_discount", // 专业老师在线答疑
  "claim", // 立即认领
  "co_branded_card",
  "collector_guide", // 游玩图文指南
  "common_coupon_bar", // 领券条幅
  "common_coupon_card", // 优惠券卡片
  "comprehensiveEditEntrance", // 编辑地点信息
  "contributor", // 地点贡献
  "cpt_service_shop", // 买卖二手房
  "dayTripList", // 热门一日游
  "discount_commodity", // 优惠团购
  "divergentRecommendModule", // 你可能还喜欢
  "everyOneToSee", // 大家还在看
  "feedback", // 问题反馈
  "first_surround_estate_tab", // 周边小区
  "horizontalGoodsShelf",
  "hotPlay", // 热门玩法
  "hot_new_house_estate",
  "hot_shop",
  "hotelCoupon",
  "hotelList", // 热门酒店
  "hotelMustRead", // 订房必读
  "houseList",
  "houseOfficeBrandIntroduction",
  "houseOfficeInfo",
  "houseOfficeNotice",
  "houseOfficeService",
  "houseShelf", // 小区在售房源
  "house_apart_info",
  "house_buying_agent",
  "house_coupon",
  "house_cp_clues",
  "house_cpt_coupon",
  "house_cpt_grab",
  "house_price",
  "house_price_v2",
  "house_rent_sale_agency",
  "image_banner",
  "kaMarketingCampaign", // 附近品牌动态
  "kaProductMixServiceShelf", // 骑手送药上门
  "ka_not_enter", // 移动办卡
  "legSameIndustryRecEntrance", // 全城最热景点推荐
  "legal_document", // 房源法律信息
  "listBizRec_1",
  "listBizRec_2", // 周边餐饮
  "matrix_banner", // 高德车服
  "merchantSettlement", // 商家店铺管理
  "membership", // 会员项目
  "mini_hook_shelf", // 购票迷你模块
  "movie_info", // 优惠购票
  "multi_page_anchor", // 二级导航菜单
  "nearbyGoodCar", // 附近热门新车
  "nearbyRecommendModule", // 周边推荐
  "nearby_house",
  "nearby_new_house_estate",
  "nearby_office_estate",
  "nearby_old_sell_estate",
  "nearby_play_rec", // 附近玩乐项目
  "newGuest", // 新客专享
  "newRelatedRecommends", // 探索周边
  "new_operation_banner", // 精选活动
  "newsellhouse",
  "officerenthouse",
  "officesellhouse",
  "official_account", // 其他平台官方账号
  "oldsellhouse",
  "operation_banner", // 横版图片推广
  "operator_card",
  "packageShelf", // 附近酒景推荐
  "parentBizRec",
  "parentPoiRecEntrance", // 所在商圈
  "platformCustomerCommonModule", // 众安保险赔付
  "platformCustomerComplianceInfo",
  "poiDetailWaterFeed", // 附近景点瀑布流
  "poiDetailWaterFeedTitle",
  "poster_banner",
  "portal_entrance", // 旅游版块引流
  "quickLink", // 地点详情页推广图标
  "relatedRecommends", // 附近同类型酒店
  "renthouse",
  "rentSaleHouse",
  "rentsaleagencyv2",
  "rentsaleagencyv3",
  "rentsalehouse",
  "residentialOwners", // 小区业主
  "reviews", // 用户评价
  "sameIndustryRecommendModule",
  "sameIndustry2RecommendModule",
  "scenic_coupon", // 优惠券过期提示
  "scenic_filter", // 购票悬浮菜单
  "scenic_lifeservices", // 吃住购娱
  "scenic_mustplay", // 必游景点
  "scenic_play_guide", // 游玩攻略
  "scenic_recommend", // 景点建议
  "scenic_voice", // 语音讲解（付费）
  "searchPlaMap", // 周边推荐
  "second_surround_estate_tab", // 周边房产
  "service_shop", // 中介门店
  "shopBaseCase", // 装修案例
  "smallListBizRec", // 周边热门酒店
  "smallOrListBizRec",
  "surroundHouseTab",
  "surroundOldSellHouse",
  "surroundRentHouse",
  "surround_facility",
  "surround_facility_new",
  "surround_house_tab",
  "surround_oldsellhouse",
  "surround_renthouse",
  "surround_rentoffice",
  "surround_selloffice",
  "thirdparty_info", // 第三方信息
  "travelGuideRec", // 人气景点 路线 购票
  "uploadBar",
  "upload_bar", // 上传照片
  "verification", // 商家已入驻
  "waistRecEntrance", // 更多人气好去处
  "waterFallFeed", // 附近景点瀑布流
  "waterFallFeedTitle"
];

// 整体图层里需要关闭 key 的清单（置为 status:1 / value:"" 相当于下线）
const FROG_KEYS = [
  "Naviendpage_Searchwords",
  "SplashScreenControl",
  "TipsTaxiButton", // 选路线页 打车图标
  "amapCoin",
  "favorites_info", // 收藏夹顶部横图推广
  "feedback_banner", // 店主专属通道
  "footprint", // 足迹
  "his_input_tip",
  "home_business_position_config", // 首页右上角动图
  "hotel_activity",
  "hotel_fillin_opt",
  "hotel_loop",
  "hotel_tipsicon",
  "hotsaleConfig", // 酒店限时抢购
  "landing_page_info", // 发现吃喝玩乐好去处
  "map_weather_switch", // 天气
  "maplayers", // 赏花地图
  "navi_end", // 导航结束领油滴
  "nearby_business_popup",
  "nearby_map_entry_guide",
  "nearby_map_pull_down_guide",
  "operation_layer", // 首页右上角图层
  "poi_rec",
  "preword",
  "route_banner", // 搜索路线 免费抽机票
  "routeresult_banner",
  "search_homepage",
  "search_keyword",
  "search_moni",
  "search_perf",
  "search_poi_recommend",
  "search_service_adcode",
  "search_word",
  "sportsGroupConfig",
  "sportsHealthConfig",
  "sportsHomeConfig",
  "sportsRouteConfig",
  "sportsTaskConfig",
  "sports_walk",
  "small_biz_b2b_kb", // 入驻高德
  "small_biz_case", // 推广
  "small_biz_fun",
  "small_biz_index",
  "small_biz_news",
  "splashscreen",
  "splashview_config",
  "sur_bar", // 节日特惠
  "taxi_activity", // 打车活动
  "testflight_adiu",
  "tf_remind", // TF 测试版
  "tips_bar_black_list",
  "vip"
];

const isVoiceAd = (i) => /ads-\d+/.test(i && i.dynamic_id_s); // 导航语音插播广告

// ---- 主体 -------------------------------------------------------------------

const url = normalize(($request && $request.url) || "");

// 无响应体：直接放行
if (!$response || !$response.body) {
  return $done({});
}

// 非 JSON 响应：放行，不处理
let obj;
try {
  obj = JSON.parse($response.body);
} catch (e) {
  log("响应体不是 JSON，跳过 " + e);
  return $done({});
}
if (!obj || typeof obj !== "object") {
  return $done({});
}

// 1) 公交出行：导航前接口（卡路里数值、左上角动图）
if (on("route") && has(url, "/aos/perception/publicTravel/beforeNavi")) {
  dirty = true; log("命中 " + url);
  reset(obj?.data?.common_data?.bus_plan_bottom_event, "data", []);
  reset(obj?.data?.common_data?.bus_plan_segment_event, "data", []);
  reset(obj?.data?.front_end, "assistant", []);
}
// 2) 打车页：营销皮肤
else if (on("taxi") && has(url, "/boss/car/order/content_info")) {
  dirty = true; log("命中 " + url);
  reset(obj?.data?.lubanData?.skin, "dataList", []);
}
// 3) 打车页：横幅 / 轮播 / 皮肤 / 提示
else if (on("taxi") && has(url, "/boss/order_web/friendly_information") || has(url, "/boss/order_web/friendly-information")) {
  dirty = true; log("命中 " + url);
  const items = ["banners", "carouselTips", "integratedBanners", "integratedTips", "skins", "skinAndTips", "tips"];
  const d105 = obj?.data?.["105"];
  if (d105) del(d105, ...items);
}
// 4) 公交列表：顶部横图、打车推广
else if (on("route") && has(url, "/bus/plan/integrate")) {
  dirty = true; log("命中 " + url);
  reset(obj?.data?.banner_lists, "data", []);
  reset(obj?.data?.banner_lists, "tips", []);
  reset(obj?.data?.mixed_plans?.data, "taxiPlans", []);
}
// 5) 酒店 / 民宿 / 景区门票 / 火车飞机页
else if (on("poi") && has(url, "/c3frontend/af-hotel/page/main")) {
  dirty = true; log("命中 " + url);
  const modules = obj?.data?.modules;
  if (modules) {
    del(modules, "CouponPortalCard", "CouponWidget", "recommended_list");
    const ufc = modules?.user_filter_card?.data;
    if (ufc) {
      del(ufc.search_button_data, "rightbgText"); // 查询按钮右上角角标
      del(ufc, "banner", "bannerList", "service_data", "sug_items_data");
    }
  }
}
// 6) 步行导航结束推广卡片
else if (on("route") && has(url, "/c3frontend/af-launch/page/main")) {
  dirty = true; log("命中 " + url);
  reset(obj?.data?.modules?.C1EndNaviEngine, "data", {});
}
// 7) 附近页（FaaS 版）：清掉推广横幅与悬浮窗，保留页面主体
else if (on("nearby") && has(url, "/c3frontend/af-nearby")) {
  dirty = true; log("命中 " + url);
  const modules = obj?.data?.modules;
  if (modules) {
    del(modules, "CouponPortalCard", "CouponWidget", "operation_banner", "poster_banner");
  }
}
// 8) 路线规划页：带 schema 参数的子卡片均为推广
else if (on("route") && has(url, "/faas/amap-navigation/card-service-plan-home")) {
  dirty = true; log("命中 " + url);
  const children = obj?.data?.children;
  if (Array.isArray(children) && children.length > 0) {
    obj.data.children = children.filter((i) => !Object.prototype.hasOwnProperty.call(i, "schema"));
  }
}
// 9) 首页底部卡片：只保留继续导航 / 常去地点 / 登录 / 找车
else if (on("home") && has(url, "/faas/amap-navigation/main-page")) {
  dirty = true; log("命中 " + url);
  const keepCards = ["ContinueNavigationCard", "FrequentLocation", "LoginCard"];
  const cardList = obj?.data?.cardList;
  if (Array.isArray(cardList)) {
    obj.data.cardList = cardList.filter((i) => keepCards.includes(i?.dataKey));
  }
  const mapBizList = obj?.data?.mapBizList;
  if (Array.isArray(mapBizList)) {
    obj.data.mapBizList = mapBizList.filter((i) => i?.dataKey === "FindCarVirtualCard");
  }
}
// 10) 导航详情页：语音广告、助手皮肤、音乐底栏
else if (on("route") && has(url, "/perception/drive/routeInfo")) {
  dirty = true; log("命中 " + url);
  if (Array.isArray(obj?.data?.tbt?.event)) {
    obj.data.tbt.event = obj.data.tbt.event.filter((i) => !isVoiceAd(i));
  }
  const fe = obj?.data?.front_end;
  if (fe) {
    del(fe, "assistant");
    if (Array.isArray(fe.guide_tips)) {
      fe.guide_tips = fe.guide_tips.filter((i) => i?.biz_type !== "music");
    }
    if (Array.isArray(fe.download)) {
      fe.download = fe.download.filter((i) => !isVoiceAd(i));
    }
  }
}
// 11) 驾车路线规划页
else if (on("route") && has(url, "/perception/drive/routePlan")) {
  dirty = true; log("命中 " + url);
  const fe = obj?.data?.front_end;
  if (fe) {
    del(fe, "assistant", "global_guide_data", "route_search", "start_button_tips");
    if (Array.isArray(fe.download)) {
      fe.download = fe.download.filter((i) => !isVoiceAd(i));
    }
  }
  if (Array.isArray(obj?.data?.tbt?.event)) {
    obj.data.tbt.event = obj.data.tbt.event.filter((i) => !isVoiceAd(i));
  }
}
// 12) 打车资源位：红点角标 / 弹窗 / 横幅 / 推送
else if (on("taxi") && has(url, "/promotion-web/resource")) {
  dirty = true; log("命中 " + url);
  const items = ["alpha", "banner", "bravo", "bubble", "charlie", "icon", "other", "popup", "push", "tips"];
  if (obj?.data) del(obj.data, ...items);
}
// 13) 我的页面
else if (on("profile") && has(url, "/shield/dsp/profile/index/nodefaasv3")) {
  dirty = true; log("命中 " + url);
  const data = obj?.data;
  if (data) {
    del(data, "tipData", "memberInfo", "topMixedCard");
    const cardList = data?.cardList;
    if (Array.isArray(cardList) && cardList.length > 0) {
      data.cardList = cardList.filter((i) => i?.dataKey === "MyOrderCard");
    }
  }
}
// 14) 整体图层配置：把推广开关置为下线
else if (on("home") && has(url, "/shield/frogserver/aocs/updatable/")) {
  dirty = true; log("命中 " + url);
  const data = obj?.data;
  if (data) {
    for (const key of FROG_KEYS) {
      if (data[key]) {
        data[key] = { status: 1, version: "", value: "" };
      }
    }
  }
}
// 15) 地图优惠推广
else if (on("poi") && has(url, "/shield/search/common/coupon/info")) {
  dirty = true; log("命中 " + url);
  if (obj?.data) obj.data = {};
}
// 16) 附近页：只保留轮播与推荐流
else if (on("nearby") && has(url, "/shield/search/nearbyrec_smart")) {
  dirty = true; log("命中 " + url);
  const keep = ["head", "search_hot_words", "feed_rec"];
  const modules = obj?.data?.modules;
  if (Array.isArray(modules)) {
    obj.data.modules = modules.filter((i) => keep.includes(i));
  } else if (modules && typeof modules === "object") {
    // FaaS 返回的是键值集合时，按 key 过滤
    for (const key of Object.keys(modules)) {
      if (!keep.includes(key)) del(modules, key);
    }
  }
}
// 17) POI 搜索详情页
else if (on("poi") && has(url, "/shield/search/poi/detail")) {
  dirty = true; log("命中 " + url);
  const modules = obj?.data?.modules;
  if (modules) del(modules, ...POI_DETAIL_MODULES);
}
// 18) 搜索框热榜
else if (on("search") && has(url, "/shield/search_bff/hotword")) {
  dirty = true; log("命中 " + url);
  reset(obj?.data, "headerHotWord", []);
}
// 19) 搜索结果列表 / mps
else if (on("search") && has(url, "/shield/search_poi/search/sp") || has(url, "/shield/search_poi/mps") || has(url, "/shield/search_poi/sp@") /* 兼容 */ ) {
  dirty = true; log("命中 " + url);
  const cleanListData = (list) => {
    if (!list) return;
    const content = list?.content && list.content[0];
    if (content?.hookInfo?.data) {
      del(content.hookInfo.data, "header", "house_info");
    }
    del(content?.map_bottom_bar, "hotel");
    del(content?.poi?.item_info?.tips_bottombar_button, "hotel");
    del(content?.map, "main_point");
    del(content, "tips_operation_info");
    del(content?.bottom?.bottombar_button, "hotel");
    // 顶部广告卡片
    const card = content?.card;
    if (card) {
      const drop =
        (card.card_id === "SearchCardBrand" && content?.item_type === "brandAdCard") ||
        (card.card_id === "NearbyGroupBuy" && content?.item_type === "toplist") ||
        (card.card_id === "ImageBanner" && content?.item_type === "ImageBanner");
      if (drop) del(content, "card");
    }
  };

  if (obj?.data?.list_data) {
    cleanListData(obj.data.list_data);
  } else if (obj?.data?.district?.poi_list && obj.data.district.poi_list.length > 0) {
    const poi = obj.data.district.poi_list[0];
    del(poi, "transportation", "feed_rec_tab");
  } else if (obj?.data?.modules) {
    const m = obj.data.modules;
    if (m?.not_parse_result?.data?.list_data) {
      cleanListData(m.not_parse_result.data.list_data);
    }
    if (m?.list_data?.data) {
      const list = m.list_data.data;
      if (Array.isArray(list?.content) && list.content.length > 0) {
        list.content = list.content.filter((i) => !["brandAdCard", "toplist_al"].includes(i?.item_type));
      }
    }
  }
}
// 20) 搜索联想词：过滤广告位与推广主题
else if (on("search") && has(url, "/shield/search_poi/sug")) {
  dirty = true; log("命中 " + url);
  const badType = (t, dt) => String(dt) === "12" || ["ad", "poi_ad", "toplist"].includes(t?.result_type);
  if (Array.isArray(obj?.tip_list)) {
    obj.tip_list = obj.tip_list.filter((item) => {
      const tip = item?.tip;
      if (!tip) return true;
      if (String(tip.datatype_spec) === "12") return false;
      if (["ad", "poi_ad", "toplist"].includes(tip.result_type)) return false;
      if (["ad", "exct_query_sug_merge_theme", "query_sug_merge_theme", "sp"].includes(tip.task_tag)) return false;
      return true;
    });
  } else if (Array.isArray(obj?.city_list)) {
    for (const city of obj.city_list) {
      if (Array.isArray(city?.tip_list)) {
        city.tip_list = city.tip_list.filter((ii) => {
          const tip = ii?.tip;
          if (!tip) return true;
          if (String(tip.datatype_spec) === "12") return false;
          if (["ad", "poi_ad"].includes(tip.result_type)) return false;
          return true;
        });
      }
    }
  }
}
// 21) 搜索页：底部结果上方窄横幅
else if (on("search") && has(url, "/shield/search_poi/tips_operation_location")) {
  dirty = true; log("命中 " + url);
  const data = obj?.data;
  if (data) {
    del(data, "coupon");
    const items = [
      "belt",
      "common_float_bar",
      "common_image_banner",
      "coupon_discount_float_bar",
      "coupon_float_bar",
      "discount_coupon",
      "image_cover_bar",
      "mood_coupon_banner",
      "operation_brand",
      "promotion_wrap_card",
      "tips_top_banner"
    ];
    if (data.modules) {
      for (const k of items) del(data.modules, k);
    }
  }
}
// 22) 开屏广告：保留结构但把有效期推到 2090 年、显示时长置零
else if (on("splash") && has(url, "/valueadded/alimama/splash_screen")) {
  dirty = true; log("命中 " + url);
  const ads = obj?.data?.ad;
  if (Array.isArray(ads) && ads.length > 0) {
    for (const item of ads) {
      if (item?.set?.setting) item.set.setting.display_time = 0;
      const creative = item?.creative && item.creative[0];
      if (creative) {
        creative.start_time = 3818332800; // 2090-12-31 00:00:00
        creative.end_time = 3818419199; // 2090-12-31 23:59:59
      }
    }
  }
}

// 没有任何分支命中（含该分组被参数关闭）时原样放行，不重新序列化响应体
if (!dirty) return $done({});
log("处理完成 " + url);
$done({ body: JSON.stringify(obj) });
})();
