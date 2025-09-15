/*
#!name=文本/手动上传GitHub
#!desc=使用说明看js脚本
#!openUrl = 
#!icon = https://raw.githubusercontent.com/fishdown/Icon/master/app/github.png
#!author=fishdown
#!date=2025-09-08

[Argument]
text = input,"",tag=插件文本,desc=输入要上传的完整文本，支持换行
owner = input,"",tag=git用户名,desc=GitHub 用户名
repo = input,"",tag=git仓库名,desc=GitHub 仓库名
branch = input,"",tag=git分支,desc=GitHub 分支
path = input,"/*.lpx",tag=文件路径,desc=文件夹/文件名.lpx
ghToken = input,"",tag=gitoken,desc=GitHub Token

open= switch,false,tag=开关,desc=
time = input,"35 * * * *",tag=Cron时间,desc=cron表达式

[Script]
cron {time} script-path=data-github-upload.js, timeout=60, img-url=https://raw.githubusercontent.com/fishdown/Icon/master/app/github.png,enable={open},tag=Github上传文件, argument=[{text},{owner},{repo},{path},{branch},{ghToken}]
*/
// 本js文件，plugins,scripts 都放，直接添加本地插件，data-github-upload.js
// 本地文件，可以在[Argument]预设自己的input，input后面双引号内，token建议在ui界面输入
// 要申请GitHub token 要有权限，自行google。
// 弄清楚文件路径，看准下面申明的变量
// 仓库没文件，直接上传，有文件直接替换

let text = $argument.text || ""; // 外部输入的文本
let owner = $argument.owner || ""; // git用户名
let repo = $argument.repo || ""; // git仓库名
let path = $argument.path || ""; // git分支
let branch = $argument.branch || ""; // 文件夹/文件名.lpx,不是固定.lpx；js.conf啥都行，这里填写就是，仓库名后面，不管套了几个文件夹都得写清楚  
let ghToken = $argument.ghToken || ""; // GitHub Token

const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
const startTime = Date.now();

// ========== 主入口 ==========
if (text.trim()) {
    console.log("📦 检测到 $argument.text，准备上传");
    uploadFile(text);
} else {
    console.log("❌ 未检测到输入文本，取消上传");
    $notification.post(
        "外部文本上传GitHub",
        "❌ 上传失败",
        "请在插件参数内填写正确文本"
    );
    $done();
}

// ========== 上传文件（创建） ==========
function uploadFile(content) {
    const body = {
        message: `上传外部文本 ${new Date().toLocaleString("zh-CN", { hour12: false })}`,
        content: base64Encode(content),
        branch: branch,
    };
    const headers = {
        Authorization: `token ${ghToken}`,
        "Content-Type": "application/json",
        "User-Agent": "Loon-File-Upload-Script",
    };

    $httpClient.put({ url: apiUrl, headers, body: JSON.stringify(body) }, (err, resp, data) => {
        let res = {};
        try { res = JSON.parse(data); } catch (e) {
            console.log("❌ [上传] 响应解析失败: " + data);
            return $done();
        }

        if (resp.status === 201 && res?.content?.download_url) {
            const duration = ((Date.now() - startTime) / 1000).toFixed(2);
            console.log(`✅ 文本上传成功，耗时 ${duration}s`);
            notifySuccess(res.content.download_url, "上传", true, duration);
            $done();
        } else if (resp.status === 422) {
            console.log("📄 文件已存在，准备更新");
            getFileShaAndUpdate(content);
        } else {
            console.log("❌ [上传] GitHub 响应异常：" + JSON.stringify(res));
            $notification.post("外部文本上传GitHub", "❌ 上传失败", JSON.stringify(res));
            $done();
        }
    });
}

// ========== 获取 SHA 并更新 ==========
function getFileShaAndUpdate(content) {
    const url = `${apiUrl}?ref=${branch}`;
    const headers = { Authorization: `token ${ghToken}`, "User-Agent": "Loon-M3U8-Upload-Script" };

    $httpClient.get({ url, headers }, (err, resp, data) => {
        let res = {};
        try { res = JSON.parse(data); } catch (e) {
            console.log("❌ [获取 SHA] 响应解析失败: " + data);
            return $done();
        }
        if (res?.sha) {
            updateFile(content, res.sha);
        } else {
            console.log("❌ [获取 SHA] 无效 SHA");
            $done();
        }
    });
}

// ========== 更新文件 ==========
function updateFile(content, sha) {
    const body = {
        message: `更新外部文本 ${new Date().toLocaleString("zh-CN", { hour12: false })}`,
        content: base64Encode(content),
        branch: branch,
        sha: sha,
    };
    const headers = {
        Authorization: `token ${ghToken}`,
        "Content-Type": "application/json",
        "User-Agent": "Loon-M3U8-Upload-Script",
    };

    $httpClient.put({ url: apiUrl, headers, body: JSON.stringify(body) }, (err, resp, data) => {
        let res = {};
        try { res = JSON.parse(data); } catch (e) {
            console.log("❌ [更新] 响应解析失败: " + data);
            return $done();
        }

        if (resp.status === 200 && res?.content?.download_url) {
            const duration = ((Date.now() - startTime) / 1000).toFixed(2);
            console.log(`✅ 文本更新成功，耗时 ${duration}s`);
            notifySuccess(res.content.download_url, "更新", true, duration);
        } else {
            console.log("❌ [更新] GitHub 响应异常：" + JSON.stringify(res));
            $notification.post("外部文本上传GitHub", "❌ 更新失败", JSON.stringify(res));
        }
        $done();
    });
}

// ========== 通知 ==========
function notifySuccess(downloadUrl, action, success = true, duration = "0") {
    const rawUrl = downloadUrl
        .replace("https://github.com/", "https://raw.githubusercontent.com/")
        .replace("/blob/", "/");

    const attach = { openUrl: rawUrl, clipboard: rawUrl };
    const title = `${success ? "✅" : "❌"} ${action}成功 | ${duration}s`;

    $notification.post("外部文本上传GitHub", title, rawUrl, attach);
}

// ========== base64 编码，保持换行 ==========
// ========== base64 编码（兼容中文 & 换行） ==========
function base64Encode(str) {
    let encoded = "";
    try {
        // 先转成 UTF-8，再 base64
        encoded = Buffer.from(str, "utf-8").toString("base64");
    } catch (e) {
        // 如果 Buffer 不可用，用 btoa 替代
        encoded = btoa(unescape(encodeURIComponent(str)));
    }
    return encoded;
}