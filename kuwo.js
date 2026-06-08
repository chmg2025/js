/**
 * 酷我音乐 VIP 接口加解密 — 通用重写脚本（支持 request + response）
 * 兼容 Quantumult X / Loon / Surge
 *
 * 加载策略: 优先读本地缓存 env.js，没有再远程拉取后 eval + 缓存
 *
 * ── Response 场景（修改响应体） ──
 *   QX:   [rewrite_local]  ^https:\/\/vipapi\.kuwo\.cn\/.* url script-response-body https://your-host/kw_music.js
 *   Loon: [Script]  http-response ^https:\/\/vipapi\.kuwo\.cn\/.* script-path=https://your-host/kw_music.js, requires-body=true, timeout=20
 *   Surge: [Script] kw_music = type=http-response, pattern=^https:\/\/vipapi\.kuwo\.cn\/.*, script-path=https://your-host/kw_music.js, requires-body=1
 *
 * ── Request 场景（修改请求头/体/URL） ──
 *   QX:   [rewrite_local]  ^https:\/\/xxx\.cn\/.* url script-request-body https://your-host/kw_music.js
 *   Loon: [Script]  http-request ^https:\/\/xxx\.cn\/.* script-path=https://your-host/kw_music.js, requires-body=true, timeout=20
 *   Surge: [Script] kw_req = type=http-request, pattern=^https:\/\/xxx\.cn\/.*, script-path=https://your-host/kw_music.js, requires-body=1
 */

// ==================== 配置 ====================
var ENV_URL   = "https://raw.githubusercontent.com/chmg2025/js/refs/heads/main/env.js";          // ← env.js 公网地址
var WORKER    = "https://kuwo.chmg2025.ip-ddns.com";       // ← CF Worker 地址
var CACHE_KEY = "kw_env_cache";

// ==================== 环境检测（最小化，不依赖 env.js） ====================
var ENV_TYPE = typeof $task !== "undefined" ? "QX" :
               typeof $loon  !== "undefined" ? "Loon" :
               typeof $httpClient !== "undefined" ? "Surge" : "Node";

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

// ==================== env.js 加载 ====================
function loadEnvAndRun(callback) {
  var cached = _envRead(CACHE_KEY);
  if (cached) { eval(cached); callback(); return; }

  console.log("[kw_music] 首次加载 env.js，远程拉取中...");
  if (ENV_TYPE === "QX") {
    $task.fetch({ url: ENV_URL }).then(
      function (resp) { _envWrite(CACHE_KEY, resp.body); eval(resp.body); callback(); },
      function (err) { console.log("[kw_muisc] env.js 拉取失败: " + (err.error || err)); $done({}); }
    );
    return;
  }
  $httpClient.get({ url: ENV_URL }, function (err, resp, data) {
    if (err || !data) { console.log("[ ] env.js 拉取失败: " + (err || "empty")); $done({}); return; }
    _envWrite(CACHE_KEY, data); eval(data); callback();
  });
}

// ==================== 业务主逻辑 ====================
loadEnvAndRun(function () {

  var logger = createLogger("kw_music");
  var mode = IS_RESPONSE ? "response" : "request";
  logger.log("脚本启动", { mode: mode });

  // 取当前场景的 url 和 body
  var url  = IS_RESPONSE ? $response.url  : $request.url;
  var body = IS_RESPONSE ? $response.body : $request.body;

  // ===== 通用解密处理器（response 场景） =====
  function vipencHandler(ctx) {
    if (!ctx.body) { ctx.logger.log("空响应体"); $done({}); return; }

    ctx.logger.log("处理响应", { len: ctx.body.length });
    http({
      url: WORKER + "/",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: ctx.body })
    }).then(
      function (resp) {
        var r = JSON.parse(resp.body);
        if (r.code === 200) {
          ctx.logger.log("处理成功", { outLen: r.data.length });
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

  

  // ===== 路由表 =====
  var dispatch = router([
    { pattern: /vip\/enc\/user\/vip\?op=ui/,    name: "vip_enc",   handler: vipencHandler },
    // { pattern: /something/, name: "req_mod", handler: modifyRequest },
  ], { logger: logger });

  dispatch(url, body);
});
