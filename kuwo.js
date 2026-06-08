// ==================== 配置 ====================
var ENV_URL   = "https://raw.githubusercontent.com/chmg2025/js/refs/heads/main/env.js";          
var CACHE_KEY = "kw_env_cache";

// ==================== 环境检测 ====================
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
  logger.log("脚本启动", { mode: mode });

  // 取当前场景的 url 和 body
  var url  = IS_RESPONSE ? $response.url  : $request.url;
  var body = IS_RESPONSE ? $response.body : $request.body;

  // ===== 通用解密处理器（response 场景） =====
  function vipencHandler(ctx) {
    if (!ctx.body) { ctx.logger.log("空响应体"); $done({}); return; }

    ctx.logger.log("处理响应", { len: ctx.body.length });
    http({
      url: "https://kuwo.chmg2025.ip-ddns.com/",
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
    { pattern: "vip/enc/user/vip",    name: "vip_enc",   handler: vipencHandler },
  ], { logger: logger });

  dispatch(url, body);
});
