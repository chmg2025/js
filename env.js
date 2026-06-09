/**
 * 通用环境工具包 — 兼容 Quantumult X / Loon / Surge
 *
 * 部署: 放到公网，由重写脚本远程拉取后 eval 注入
 * 注入后全局可用: ENV, http, notify, createLogger, router
 */

// ===== 环境检测 =====
var ENV = (() => {
  var type = typeof $task !== "undefined" ? "QX" :
             typeof $loon  !== "undefined" ? "Loon" :
             typeof $httpClient !== "undefined" ? "Surge" : "Node";
  return { type: type };
})();

// ===== 持久化读写 =====
function _read(key) {
  try {
    return ENV.type === "QX" ? $prefs.valueForKey(key) : $persistentStore.read(key);
  } catch (_) { return null; }
}
function _write(key, val) {
  try {
    ENV.type === "QX" ? $prefs.setValueForKey(val, key) : $persistentStore.write(val, key);
  } catch (_) {}
}

// ===== 统一 HTTP 请求 =====
function http(opts) {
  var url = opts.url, method = opts.method, headers = opts.headers, body = opts.body;
  return new Promise(function (resolve, reject) {
    if (ENV.type === "QX") {
      $task.fetch({ url: url, method: method || "GET", headers: headers, body: body }).then(
        function (resp) { resolve({ status: resp.statusCode, body: resp.body }); },
        function (err) { reject(err); }
      );
    } else {
      var cb = function (err, resp, data) {
        if (err) return reject(err);
        resolve({ status: resp.status, body: data });
      };
      if (method === "POST" || method === "PUT") {
        $httpClient.post({ url: url, headers: headers || {}, body: body }, cb);
      } else {
        $httpClient.get({ url: url, headers: headers || {} }, cb);
      }
    }
  });
}

// ===== 通知 =====
function notify(title, subtitle, body) {
  try {
    if (ENV.type === "QX") $notify(title, subtitle, body);
    else $notification.post(title, subtitle, body);
  } catch (_) {}
}

// ===== 日志模块 =====
/**
 * createLogger(name) → { log, getLogs, clearLogs }
 *   name — 前缀 + 持久化 key: __kw_logs_<name>__
 */
function createLogger(name) {
  var prefix = "[" + name + "]";
  var storageKey = "__kw_logs_" + name + "__";

  function log(msg, data) {
    var line = data !== undefined
      ? prefix + " " + msg + " " + (typeof data === "object" ? JSON.stringify(data) : data)
      : prefix + " " + msg;
    console.log(line);
    try {
      var raw = _read(storageKey);
      var logs = raw ? JSON.parse(raw) : [];
      logs.push({ t: Date.now(), msg: line });
      if (logs.length > 200) logs = logs.slice(-200);
      _write(storageKey, JSON.stringify(logs));
    } catch (_) {}
  }

  function getLogs() {
    try { var raw = _read(storageKey); return raw ? JSON.parse(raw) : []; } catch (_) { return []; }
  }
  function clearLogs() { _write(storageKey, "[]"); }

  return { log: log, getLogs: getLogs, clearLogs: clearLogs };
}

// ===== URL 路由 =====
/**
 * router(rules, opts)
 *   rules: [{ pattern: /regex/ | "string", name: "标识", handler: fn }]
 *   opts:  { logger, defaultHandler? }
 *   handler(ctx): ctx = { url, body, name, logger, http, notify, $response, $request, $done }
 *   返回: (url, body) => void
 */
function router(rules, opts) {
  var logger = (opts && opts.logger) || null;
  var defaultHandler = (opts && opts.defaultHandler) || null;

  return function (url, body) {
    for (var i = 0; i < rules.length; i++) {
      var rule = rules[i];
      var matched = typeof rule.pattern === "string"
        ? url.indexOf(rule.pattern) !== -1
        : rule.pattern.test(url);
      if (matched) {
        var ctx = {
          url: url, body: body, name: rule.name, logger: logger,
          http: http, notify: notify,
          $response: $response, $request: $request, $done: $done
        };
        const urlObj = new URL(url);
        if (logger) logger.log("→ [" + urlObj.pathname + "]");
        return rule.handler(ctx);
      }
    }
    if (defaultHandler) {
      var ctx = { url: url, body: body, name: "default", logger: logger, http: http, notify: notify, $response: $response, $request: $request, $done: $done };
      return defaultHandler(ctx);
    }
    if (logger) logger.log("→ 无匹配路由", { url: url });
    $done({});
  };
}
