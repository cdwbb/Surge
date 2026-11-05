/*
 * 高德地图去广告 · 自建脚本（Surge http-response）
 * 只处理本地已有的响应 JSON，不发起任何外部请求，不依赖 kelee.one
 * 配套模块：amap_ads_clean.sgmodule
 */
(function () {
  "use strict";

  var url = ($request && $request.url) || "";
  var body = $response && $response.body;

  if (!body) {
    return $done({});
  }

  var obj;
  try {
    obj = JSON.parse(body);
  } catch (e) {
    return $done({});
  }
  if (!obj || typeof obj !== "object") {
    return $done({});
  }

  function at(root, path) {
    var cur = root;
    for (var i = 0; i < path.length; i++) {
      if (!cur || typeof cur !== "object") return undefined;
      cur = cur[path[i]];
    }
    return cur;
  }

  function rm(root, path) {
    if (path.length < 1) return;
    var parent = at(root, path.slice(0, -1));
    if (parent && typeof parent === "object") {
      delete parent[path[path.length - 1]];
    }
  }

  // 仅当键已存在时替换值，避免给协议造出新的空字段
  function put(root, path, value) {
    var parent = at(root, path.slice(0, -1));
    var key = path[path.length - 1];
    if (parent && typeof parent === "object" && Object.prototype.hasOwnProperty.call(parent, key)) {
      parent[key] = value;
    }
  }

  function delKeys(node, keys) {
    if (!node || typeof node !== "object") return;
    for (var i = 0; i < keys.length; i++) delete node[keys[i]];
  }

  function keep(list, pred) {
    if (Array.isArray(list)) return list.filter(pred);
    return list;
  }

  function setIfArray(node, key, value) {
    if (node && typeof node === "object" && Array.isArray(node[key])) node[key] = value;
  }

  var ADS_EVENT = /ads-\d+/;
  var POI_DETAIL_AD = [
    "CouponBanner", "adv_compliance_info", "adv_gift", "bigListBizRec", "bottomDescription",
    "brand_shop_bar", "checkIn", "check_in", "cityCardFeed", "city_discount", "claim",
    "co_branded_card", "collector_guide", "common_coupon_bar", "common_coupon_card",
    "comprehensiveEditEntrance", "contributor", "cpt_service_shop", "dayTripList",
    "discount_commodity", "divergentRecommendModule", "everyOneToSee", "feedback",
    "first_surround_estate_tab", "horizontalGoodsShelf", "hotPlay", "hot_new_house_estate",
    "hot_shop", "hotelCoupon", "hotelList", "hotelMustRead", "houseList",
    "houseOfficeBrandIntroduction", "houseOfficeInfo", "houseOfficeNotice",
    "houseOfficeService", "houseShelf", "house_apart_info", "house_buying_agent",
    "house_coupon", "house_cp_clues", "house_cpt_coupon", "house_cpt_grab", "house_price",
    "house_price_v2", "house_rent_sale_agency", "image_banner", "kaMarketingCampaign",
    "kaProductMixServiceShelf", "ka_not_enter", "legSameIndustryRecEntrance",
    "legal_document", "listBizRec_1", "listBizRec_2", "matrix_banner", "merchantSettlement",
    "membership", "mini_hook_shelf", "movie_info", "multi_page_anchor", "nearbyGoodCar",
    "nearbyRecommendModule", "nearby_house", "nearby_new_house_estate",
    "nearby_office_estate", "nearby_old_sell_estate", "nearby_play_rec", "newGuest",
    "newRelatedRecommends", "new_operation_banner", "newsellhouse", "officerenthouse",
    "officesellhouse", "official_account", "oldsellhouse", "operation_banner",
    "operator_card", "packageShelf", "parentBizRec", "parentPoiRecEntrance",
    "platformCustomerCommonModule", "platformCustomerComplianceInfo", "poiDetailWaterFeed",
    "poiDetailWaterFeedTitle", "portal_entrance", "poster_banner", "quickLink",
    "relatedRecommends", "renthouse", "rentSaleHouse", "rentsaleagencyv2",
    "rentsaleagencyv3", "rentsalehouse", "residentialOwners", "reviews",
    "sameIndustry2RecommendModule", "sameIndustryRecommendModule", "scenic_coupon",
    "scenic_filter", "scenic_lifeservices", "scenic_mustplay", "scenic_play_guide",
    "scenic_recommend", "scenic_voice", "searchPlaMap", "second_surround_estate_tab",
    "service_shop", "shopBaseCase", "smallListBizRec", "smallOrListBizRec",
    "surroundHouseTab", "surroundOldSellHouse", "surroundRentHouse", "surround_facility",
    "surround_facility_new", "surround_house_tab", "surround_oldsellhouse",
    "surround_renthouse", "surround_rentoffice", "surround_selloffice", "thirdparty_info",
    "travelGuideRec", "uploadBar", "upload_bar", "verification", "waistRecEntrance",
    "waterFallFeed", "waterFallFeedTitle"
  ];

  // 首页/图层等运营开关：置为「已关闭」而不是删除，客户端读到的仍是合法结构
  var LAYER_CLOSED = { status: 1, version: "", value: "" };
  var LAYER_AD = [
    "Naviendpage_Searchwords", "SplashScreenControl", "TipsTaxiButton", "amapCoin",
    "favorites_info", "feedback_banner", "footprint", "his_input_tip",
    "home_business_position_config", "hotel_activity", "hotel_fillin_opt", "hotel_loop",
    "hotel_tipsicon", "hotsaleConfig", "landing_page_info", "map_weather_switch",
    "maplayers", "navi_end", "nearby_business_popup", "nearby_map_entry_guide",
    "nearby_map_pull_down_guide", "operation_layer", "poi_rec", "preword", "route_banner",
    "routeresult_banner", "search_homepage", "search_keyword", "search_moni", "search_perf",
    "search_poi_recommend", "search_service_adcode", "search_word", "sportsGroupConfig",
    "sportsHealthConfig", "sportsHomeConfig", "sportsRouteConfig", "sportsTaskConfig",
    "sports_walk", "small_biz_b2b_kb", "small_biz_case", "small_biz_fun", "small_biz_index",
    "small_biz_news", "splashscreen", "splashview_config", "sur_bar", "taxi_activity",
    "testflight_adiu", "tf_remind", "tips_bar_black_list", "vip"
  ];

  var SEARCH_RESULT_AD = ["brandAdCard", "toplist_al"];

  var TIPS_OPERATION_AD = [
    "belt", "common_float_bar", "common_image_banner", "coupon_discount_float_bar",
    "coupon_float_bar", "discount_coupon", "image_cover_bar", "mood_coupon_banner",
    "operation_brand", "promotion_wrap_card", "tips_top_banner"
  ];

  var TAXI_RESOURCE_AD = [
    "alpha", "banner", "bravo", "bubble", "charlie", "icon", "other", "popup", "push", "tips"
  ];

  var TAXI_FRIENDLY_AD = [
    "banners", "carouselTips", "integratedBanners", "integratedTips", "skins",
    "skinAndTips", "tips"
  ];

  var DRIVE_ROUTEPLAN_AD = [
    "assistant", "global_guide_data", "route_search", "start_button_tips"
  ];

  var HOTEL_PAGE_AD = ["CouponPortalCard", "CouponWidget", "recommended_list"];
  var HOTEL_FILTER_AD = ["banner", "bannerList", "service_data", "sug_items_data"];
  var NEARBY_KEEP = ["head", "search_hot_words", "feed_rec"];
  var HOME_CARD_KEEP = ["ContinueNavigationCard", "FrequentLocation", "LoginCard"];
  var MINE_CARD_KEEP = ["MyOrderCard"];
  var MAP_BIZ_KEEP = ["FindCarVirtualCard"];

  function stripSearchList(list) {
    if (!list || typeof list !== "object") return;
    rm(list, ["hookInfo", "data", "header"]);
    rm(list, ["hookInfo", "data", "house_info"]);
    rm(list, ["map_bottom_bar", "hotel"]);
    rm(list, ["poi", "item_info", "tips_bottombar_button", "hotel"]);
    rm(list, ["map", "main_point"]);
    rm(list, ["tips_operation_info"]);
    rm(list, ["bottom", "bottombar_button", "hotel"]);
    var card = list.card;
    var type = list.item_type;
    if (
      (card && card.card_id === "SearchCardBrand" && type === "brandAdCard") ||
      (card && card.card_id === "NearbyGroupBuy" && type === "toplist") ||
      (card && card.card_id === "ImageBanner" && type === "ImageBanner")
    ) {
      delete list.card;
    }
  }

  function isAdSug(item) {
    var tip = (item && item.tip) || {};
    return (
      tip.datatype_spec === "12" ||
      tip.result_type === "ad" ||
      tip.result_type === "poi_ad" ||
      tip.result_type === "toplist" ||
      tip.task_tag === "ad" ||
      tip.task_tag === "sp" ||
      tip.task_tag === "exct_query_sug_merge_theme" ||
      tip.task_tag === "query_sug_merge_theme"
    );
  }

  var RULES = [
    [
      "/valueadded/alimama/splash_screen",
      function (o) {
        var ads = at(o, ["data", "ad"]);
        if (!Array.isArray(ads)) return;
        for (var i = 0; i < ads.length; i++) {
          put(ads[i], ["set", "setting", "display_time"], 0);
          var c = ads[i].creative;
          if (Array.isArray(c) && c[0]) {
            c[0].start_time = 3818332800; // 2090-12-31，投放期直接推到未来
            c[0].end_time = 3818419199;
          }
        }
      }
    ],
    [
      "/aos/perception/publicTravel/beforeNavi",
      function (o) {
        var d = at(o, ["data"]);
        setIfArray(at(d, ["common_data", "bus_plan_bottom_event"]), "data", []);
        setIfArray(at(d, ["common_data", "bus_plan_segment_event"]), "data", []);
        setIfArray(at(d, ["front_end"]), "assistant", []);
      }
    ],
    [
      "/bus/plan/integrate",
      function (o) {
        var d = at(o, ["data"]);
        setIfArray(at(d, ["banner_lists"]), "data", []);
        setIfArray(at(d, ["banner_lists"]), "tips", []);
        setIfArray(at(d, ["mixed_plans", "data"]), "taxiPlans", []);
      }
    ],
    [
      "/c3frontend/af-hotel/page/main",
      function (o) {
        var m = at(o, ["data", "modules"]);
        delKeys(m, HOTEL_PAGE_AD);
        var filter = at(m, ["user_filter_card", "data"]);
        delKeys(filter, HOTEL_FILTER_AD);
        delKeys(at(filter, ["search_button_data"]), ["rightbgText"]);
      }
    ],
    [
      "/c3frontend/af-launch/page/main",
      function (o) {
        put(o, ["data", "modules", "C1EndNaviEngine", "data"], {});
      }
    ],
    [
      "/faas/amap-navigation/card-service-plan-home",
      function (o) {
        var d = at(o, ["data"]);
        setIfArray(d, "children", keep(at(d, ["children"]), function (i) {
          return !(i && typeof i === "object" && "schema" in i);
        }));
      }
    ],
    [
      "/faas/amap-navigation/main-page",
      function (o) {
        var d = at(o, ["data"]);
        setIfArray(d, "cardList", keep(at(d, ["cardList"]), function (i) {
          return i && HOME_CARD_KEEP.indexOf(i.dataKey) >= 0;
        }));
        setIfArray(d, "mapBizList", keep(at(d, ["mapBizList"]), function (i) {
          return i && MAP_BIZ_KEEP.indexOf(i.dataKey) >= 0;
        }));
      }
    ],
    [
      "/perception/drive/routeInfo",
      function (o) {
        var d = at(o, ["data"]);
        setIfArray(at(d, ["tbt"]), "event", keep(at(d, ["tbt", "event"]), function (i) {
          return !(i && ADS_EVENT.test(i.dynamic_id_s));
        }));
        var fe = at(d, ["front_end"]);
        delKeys(fe, ["assistant"]);
        if (fe) {
          fe.guide_tips = keep(fe.guide_tips, function (i) {
            return !(i && i.biz_type === "music");
          });
          fe.download = keep(fe.download, function (i) {
            return !(i && ADS_EVENT.test(i.dynamic_id_s));
          });
        }
      }
    ],
    [
      "/perception/drive/routePlan",
      function (o) {
        var d = at(o, ["data"]);
        delKeys(at(d, ["front_end"]), DRIVE_ROUTEPLAN_AD);
        setIfArray(at(d, ["tbt"]), "event", keep(at(d, ["tbt", "event"]), function (i) {
          return !(i && ADS_EVENT.test(i.dynamic_id_s));
        }));
        var dl = at(d, ["front_end", "download"]);
        if (Array.isArray(dl)) {
          put(d, ["front_end", "download"], dl.filter(function (i) {
            return !(i && ADS_EVENT.test(i.dynamic_id_s));
          }));
        }
      }
    ],
    [
      "/promotion-web/resource",
      function (o) {
        delKeys(at(o, ["data"]), TAXI_RESOURCE_AD);
      }
    ],
    [
      "/boss/car/order/content_info",
      function (o) {
        setIfArray(at(o, ["data", "lubanData", "skin"]), "dataList", []);
      }
    ],
    [
      "/boss/order_web/friendly_information",
      function (o) {
        delKeys(at(o, ["data", "105"]), TAXI_FRIENDLY_AD);
      }
    ],
    [
      "/shield/dsp/profile/index/nodefaasv3",
      function (o) {
        var d = at(o, ["data"]);
        delKeys(d, ["tipData", "memberInfo", "topMixedCard"]);
        setIfArray(d, "cardList", keep(at(d, ["cardList"]), function (i) {
          return i && MINE_CARD_KEEP.indexOf(i.dataKey) >= 0;
        }));
      }
    ],
    [
      "/shield/frogserver/aocs/updatable/",
      function (o) {
        var d = at(o, ["data"]);
        if (!d || typeof d !== "object") return;
        for (var i = 0; i < LAYER_AD.length; i++) {
          if (Object.prototype.hasOwnProperty.call(d, LAYER_AD[i])) {
            d[LAYER_AD[i]] = { status: 1, version: "", value: "" };
          }
        }
      }
    ],
    [
      "/shield/search/common/coupon/info",
      function (o) {
        put(o, ["data"], {});
      }
    ],
    [
      "/shield/search/nearbyrec_smart",
      function (o) {
        var d = at(o, ["data"]);
        setIfArray(d, "modules", keep(at(d, ["modules"]), function (i) {
          return NEARBY_KEEP.indexOf(i) >= 0;
        }));
      }
    ],
    [
      "/shield/search/poi/detail",
      function (o) {
        delKeys(at(o, ["data", "modules"]), POI_DETAIL_AD);
      }
    ],
    [
      "/shield/search_bff/hotword",
      function (o) {
        setIfArray(at(o, ["data"]), "headerHotWord", []);
      }
    ],
    [
      "/shield/search_poi/tips_operation_location",
      function (o) {
        var d = at(o, ["data"]);
        delKeys(d, ["coupon"]);
        delKeys(at(d, ["modules"]), TIPS_OPERATION_AD);
      }
    ],
    [
      "/shield/search_poi/sug",
      function (o) {
        if (Array.isArray(o.tip_list)) {
          o.tip_list = o.tip_list.filter(function (i) {
            return !isAdSug(i);
          });
        }
        if (Array.isArray(o.city_list)) {
          for (var i = 0; i < o.city_list.length; i++) {
            var city = o.city_list[i];
            if (city && Array.isArray(city.tip_list)) {
              city.tip_list = city.tip_list.filter(function (t) {
                var tip = (t && t.tip) || {};
                return !(
                  tip.datatype_spec === "12" ||
                  tip.result_type === "ad" ||
                  tip.result_type === "poi_ad"
                );
              });
            }
          }
        }
      }
    ],
    [
      ["/shield/search_poi/mps", "/shield/search_poi/search/sp"],
      function (o) {
        var d = at(o, ["data"]);
        if (!d || typeof d !== "object") return;
        if (d.list_data) {
          var content = at(d, ["list_data", "content"]);
          if (Array.isArray(content)) {
            for (var i = 0; i < content.length; i++) stripSearchList(content[i]);
          }
        } else if (Array.isArray(at(d, ["district", "poi_list"]))) {
          for (var j = 0; j < d.district.poi_list.length; j++) {
            delKeys(d.district.poi_list[j], ["transportation", "feed_rec_tab"]);
          }
        }
        var modules = at(d, ["modules"]);
        if (modules) {
          var np = at(modules, ["not_parse_result", "data", "list_data", "content"]);
          if (Array.isArray(np)) {
            for (var k = 0; k < np.length; k++) stripSearchList(np[k]);
          }
          var lc = at(modules, ["list_data", "data", "content"]);
          if (Array.isArray(lc)) {
            put(modules, ["list_data", "data", "content"], lc.filter(function (i) {
              return !(i && SEARCH_RESULT_AD.indexOf(i.item_type) >= 0);
            }));
          }
        }
      }
    ]
  ];

  var matched = false;
  try {
    for (var r = 0; r < RULES.length; r++) {
      var keys = RULES[r][0];
      var hit = false;
      if (typeof keys === "string") {
        hit = url.indexOf(keys) >= 0;
      } else {
        for (var s = 0; s < keys.length; s++) {
          if (url.indexOf(keys[s]) >= 0) {
            hit = true;
            break;
          }
        }
      }
      if (!hit) continue;
      matched = true;
      RULES[r][1](obj);
      break;
    }
  } catch (err) {
    console.log("amap_ads_clean: " + err);
    return $done({});
  }

  if (!matched) {
    return $done({});
  }

  $done({ body: JSON.stringify(obj) });
})();
