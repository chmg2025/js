// ==================== 配置 ====================
var ENV_URL   = "https://raw.githubusercontent.com/chmg2025/js/refs/heads/main/env.js";          
var CACHE_KEY = "kw_env_cache";
// 音质映射规则
const QUALITY_RULES = {
  'ZP': { audio: '2000kflac', text: '至臻音质2.0' },
  'F': { audio: '2000kflac', text: '无损音质' },
  'S': { audio: '320kmp3', text: '超品音质' },
  'H': { audio: '128kmp3', text: '高品音质' }
};
// ==================== 环境检测 ====================
var ENV_TYPE = typeof $task !== "undefined" ? "QX" :
               typeof $loon  !== "undefined" ? "Loon" :
               typeof $httpClient !== "undefined" ? "Surge" : "Egern";

function _envRead(key) {
  try { return ENV_TYPE === "QX" ? $prefs.valueForKey(key) : $persistentStore.read(key); }
  catch (_) { return null; }
}
function _envWrite(key, val) {
  try { ENV_TYPE === "QX" ? $prefs.setValueForKey(val, key) : $persistentStore.write(val, key); }
  catch (_) {}
}

// 判断当前是 response 还是 request 脚本
var IS_RESPONSE = typeof $response !== "undefined";

// ==================== 加载 ENV ====================
function loadEnvAndRun(callback) {
  var cached = _envRead(CACHE_KEY);
  if (cached) { (0, eval)(cached); callback(); return; }

  console.log("[kw_music] 首次加载 env.js，远程拉取中...");
  if (ENV_TYPE === "QX") {
    $task.fetch({ url: ENV_URL }).then(
      function (resp) { _envWrite(CACHE_KEY, resp.body); (0, eval)(resp.body); callback(); },
      function (err) { console.log("[kw_music] env.js 拉取失败: " + (err.error || err)); $done({}); }
    );
    return;
  }
  $httpClient.get({ url: ENV_URL }, function (err, resp, data) {
    if (err || !data) { console.log("[kw_music] env.js 拉取失败: " + (err || "empty")); $done({}); return; }
    _envWrite(CACHE_KEY, data); (0, eval)(data); callback();
  });
}
// ==================== 业务主逻辑 ====================
loadEnvAndRun(function () {

  var logger = createLogger("kw_music");
  var mode = IS_RESPONSE ? "response" : "request";
  logger.log("脚本启动");

  // 取当前场景的 url 和 body
  var url  = $request.url;
  var body = IS_RESPONSE ? $response.body : $request.body;

  // ===== 通用解密处理器（response 场景） =====
  function vipEncHandler(ctx) {
    if (!ctx.body) { ctx.logger.log("无响应体"); $done({}); return; }
    http({
      url: "https://kuwo.chmg2025.ip-ddns.com/",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: ctx.body })
    }).then(
      function (resp) {
        var r = JSON.parse(resp.body);
        if (r.code === 200) {
          
          $done({ body: r.data });
        } else {
          ctx.logger.log("处理失败: " + r.error);
          $done({});
        }
      },
      function (err) {
        ctx.logger.log("网络不可达: " + (err.message || err));
        $done({});
      }
    );
  }

  function musicPayHandler(ctx) {
    if (!ctx.body) { ctx.logger.log("无响应体"); $done({}); return; }
    if (mode === 'request') {
      const quality = ctx.body.split('quality=')[1]?.split('&')[0];
      const rid = body.split('ids=')[1]?.split('&')[0];
      const rule = QUALITY_RULES[quality] || { audio: CONSTANTS.DEFAULT_QUALITY, text: CONSTANTS.DEFAULT_QUALITY_TEXT };
      _envWrite('Music_Rid', rid);
      _envWrite('Music_Quality', rule.audio);
      _envWrite('Music_Qualityb', rule.text);
      $done({})
    } else {
      const data = JSON.parse(ctx.body)
      if (data.songs && data.songs[0] && data.songs[0].audio) {
        data.songs[0].audio.forEach((item) => (item.st = 0));
      }
      data.songs[0].mp3Download = {
        couponNum: 998,
        isSVip: 1,
        isShow: 1
      };
    }
    $done({body:JSON.stringify(data)})
  }
  function musicPlayHandler(ctx){
    if (!ctx.body) { ctx.logger.log("无响应体"); $done({}); return; }
    const data = JSON.parse(ctx.body)
    if (data && data.data) {
      $done({body:JSON.stringify(data)})
    } else {
      const str = `surl=1&user=chmg2025&source=kwplayercar_ar_6.0.0.9_B_jiakong_vh.apk&type=convert_url_with_sign&br=${_envRead(Music_Quality)}&rid=${_envRead(Music_Rid)}`;
      const URL = 'https://nmobi.kuwo.cn/mobi.s?f=web&' + str;
      http(URL).then(
        function (resp) {
          $done({ body: resp.body });
        },
        function (err) {
          ctx.logger.log("网络不可达: " + (err.message || err));
          $done({});
        }
      )
    }
  }
  

  // ===== 路由表 =====
  var dispatch = router([
    { pattern: "/vip/enc/user/vip",    name: "vip_enc",   handler: vipEncHandler },
    { pattern: "/music.pay?newver",    name: "music_pay",   handler: musicPayHandler },
    { pattern: "/mobi.s?f=kwxs",    name: "music_play",   handler: musicPlayHandler },
  ], { logger: logger });

  dispatch(url, body);
});
