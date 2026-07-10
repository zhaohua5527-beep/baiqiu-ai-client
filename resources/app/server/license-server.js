const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const crypto = require("node:crypto");

const CHARSET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const PORT = Number(process.env.BAIQIU_LICENSE_PORT || 18790);
const HOST = process.env.BAIQIU_LICENSE_HOST || "127.0.0.1";
const SERVER_SECRET = process.env.BAIQIU_LICENSE_SERVER_SECRET || "BaiqiuAICommercialServerSecretChangeMe";
const ADMIN_TOKEN = process.env.BAIQIU_LICENSE_ADMIN_TOKEN || "baiqiu-admin-test";
const DB_PATH = process.env.BAIQIU_LICENSE_DB || path.join(__dirname, "license-db.json");
const RELEASES_DIR = path.join(__dirname, "releases");
const MANIFEST_PATH = path.join(__dirname, "updates.json");
const UPDATE_JSON_PATH = path.join(__dirname, "update.json");

function readDb() {
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
  } catch {
    return { licenses: [] };
  }
}

function writeDb(db) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf8");
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

function compareVersion(a, b) {
  const normalize = (value) => String(value || "0.0.0")
    .trim()
    .replace(/^v/i, "")
    .split(/[+-]/)[0]
    .split(".")
    .map((part) => Number(String(part || "0").match(/^\d+/)?.[0] || 0));
  const pa = normalize(a);
  const pb = normalize(b);
  for (let i = 0; i < Math.max(pa.length, pb.length, 3); i += 1) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

function checksum(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}


function releasePath(release, type = "zip") {
  const releaseFile = type === "installer" ? release?.installerFile : release?.file;
  return releaseFile ? path.join(RELEASES_DIR, releaseFile) : "";
}

function hasReleaseFile(release, type = "zip") {
  const file = releasePath(release, type);
  return Boolean(file && fs.existsSync(file) && fs.statSync(file).size > 1024 * 1024);
}

function isValidWindowsInstaller(release) {
  const file = releasePath(release, "installer");
  if (!file || !fs.existsSync(file)) return false;
  const stat = fs.statSync(file);
  if (stat.size < 10 * 1024 * 1024) return false;
  const fd = fs.openSync(file, "r");
  try {
    const header = Buffer.alloc(2);
    fs.readSync(fd, header, 0, 2, 0);
    return header[0] === 0x4d && header[1] === 0x5a;
  } finally {
    fs.closeSync(fd);
  }
}

function latestRelease(channel = "stable") {
  const manifest = readJson(MANIFEST_PATH, { channels: {} });
  const list = manifest.channels?.[channel] || manifest.channels?.stable || [];
  return [...list].filter((item) => hasReleaseFile(item, "zip") || hasReleaseFile(item, "installer")).sort((a, b) => compareVersion(b.version, a.version))[0] || null;
}

function latestUpdateRelease(channel = "stable") {
  const manifest = readJson(MANIFEST_PATH, { channels: {} });
  const list = manifest.channels?.[channel] || manifest.channels?.stable || [];
  return [...list].filter((item) => hasReleaseFile(item, "zip")).sort((a, b) => compareVersion(b.version, a.version))[0] || null;
}

function saveRelease({ version, file = "", installerFile = "", notes = "", forceUpdate = true }) {
  const releaseFile = file ? path.join(RELEASES_DIR, file) : "";
  const installerPath = installerFile ? path.join(RELEASES_DIR, installerFile) : "";
  const sha256 = releaseFile && fs.existsSync(releaseFile) ? checksum(releaseFile) : "";
  const installerSha256 = installerPath && fs.existsSync(installerPath) ? checksum(installerPath) : "";
  const manifest = readJson(MANIFEST_PATH, { channels: { stable: [] } });
  manifest.channels ||= {};
  const previous = (manifest.channels.stable || []).find((item) => item.version === version) || {};
  manifest.channels.stable = (manifest.channels.stable || []).filter((item) => item.version !== version);
  manifest.channels.stable.push({
    ...previous,
    version,
    file: file || previous.file || "",
    installerFile: installerFile || previous.installerFile || "",
    sha256: sha256 || previous.sha256 || "",
    installerSha256: installerSha256 || previous.installerSha256 || "",
    notes,
    forceUpdate: Boolean(forceUpdate),
    publishedAt: new Date().toISOString()
  });
  writeJson(MANIFEST_PATH, manifest);
  writeJson(UPDATE_JSON_PATH, {
    version,
    downloadUrl: file ? `/baiqiu-${version}.zip` : "",
    installerUrl: installerFile ? `/download/baiqiu-${version}-setup.exe` : "",
    forceUpdate: Boolean(forceUpdate),
    changelog: notes
  });
  return latestRelease("stable");
}

function normalizeCode(code) {
  return String(code || "").toUpperCase().replace(/[^23456789ABCDEFGHJKLMNPQRSTUVWXYZ]/g, "").replace(/(.{4})(?=.)/g, "$1-").slice(0, 19);
}

function checkChar(value) {
  const sum = [...value].reduce((total, char) => total + char.charCodeAt(0), 0);
  return CHARSET[sum % CHARSET.length];
}

function isCodeFormatValid(code) {
  if (!/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}(?:-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}){3}$/.test(code)) return false;
  return code.split("-").every((group) => checkChar(group.slice(0, 3)) === group[3]);
}

function generateCode() {
  const groups = [];
  for (let i = 0; i < 4; i += 1) {
    let raw = "";
    for (let j = 0; j < 3; j += 1) raw += CHARSET[crypto.randomInt(0, CHARSET.length)];
    groups.push(`${raw}${checkChar(raw)}`);
  }
  return groups.join("-");
}

function serverSignature(code, deviceId, expiresAt) {
  const data = `${code}${deviceId}${expiresAt}${SERVER_SECRET}`;
  return crypto.createHmac("sha256", SERVER_SECRET).update(data).digest("hex");
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function sendHtml(res, html) {
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": Buffer.byteLength(html)
  });
  res.end(html);
}

function adminPage() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>白球 AI 授权服务器</title>
  <style>
    :root { color-scheme: dark; font-family: "Microsoft YaHei", Arial, sans-serif; background: #101418; color: #eef4f8; }
    body { margin: 0; padding: 28px; background: #101418; }
    main { max-width: 1120px; margin: 0 auto; }
    h1 { margin: 0 0 18px; font-size: 24px; }
    .bar { display: flex; gap: 10px; align-items: end; flex-wrap: wrap; margin-bottom: 18px; }
    label { display: grid; gap: 6px; font-size: 13px; color: #aab7c4; }
    input, button { height: 36px; border-radius: 6px; border: 1px solid #2b3948; background: #18212b; color: #eef4f8; padding: 0 10px; }
    input { min-width: 120px; }
    button { cursor: pointer; background: #2f81f7; border-color: #2f81f7; font-weight: 600; }
    button.secondary { background: #18212b; border-color: #3a4a5c; }
    .status { min-height: 22px; color: #82d6a3; margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; background: #151b22; border: 1px solid #2b3948; border-radius: 8px; overflow: hidden; }
    th, td { padding: 10px; border-bottom: 1px solid #263340; text-align: left; font-size: 13px; vertical-align: top; }
    th { color: #aab7c4; background: #111820; font-weight: 600; }
    tr:last-child td { border-bottom: 0; }
    .code { font-family: Consolas, monospace; color: #9cdcfe; white-space: nowrap; }
    .muted { color: #8794a3; }
    .danger { color: #ff8d8d; }
    .ok { color: #82d6a3; }
    .section { margin-top: 28px; }
    .download-link { color: #9cdcfe; }
  </style>
</head>
<body>
  <main>
    <h1>白球 AI 授权服务器</h1>
    <div class="bar">
      <label>管理员令牌
        <input id="token" value="baiqiu-admin-test">
      </label>
      <label>生成数量
        <input id="count" type="number" min="1" max="500" value="1">
      </label>
      <label>允许设备数
        <input id="maxDevices" type="number" min="1" max="20" value="1">
      </label>
      <label>到期时间
        <input id="expiresAt" value="2099-12-31T23:59:59Z">
      </label>
      <button id="createBtn">生成卡密</button>
      <button class="secondary" id="refreshBtn">刷新列表</button>
    </div>
    <div class="status" id="status"></div>
    <table>
      <thead>
        <tr>
          <th>卡密</th>
          <th>状态</th>
          <th>设备</th>
          <th>到期时间</th>
          <th>创建时间</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody id="rows">
        <tr><td colspan="6" class="muted">正在加载...</td></tr>
      </tbody>
    </table>
    <section class="section">
      <h1>下载与更新</h1>
      <div class="bar">
        <label>新版本号
          <input id="releaseVersion" placeholder="1.1.3">
        </label>
        <label>更新说明
          <input id="releaseNotes" placeholder="本次更新内容">
        </label>
        <label>安装包 exe / 更新包 zip
          <input id="releaseFile" type="file" accept=".exe,.zip">
        </label>
        <button id="uploadReleaseBtn">上传安装/更新包</button>
        <button class="secondary" id="refreshReleaseBtn">刷新更新</button>
      </div>
      <div class="status" id="releaseStatus"></div>
      <p class="muted">客户下载页：<a class="download-link" href="/download" target="_blank">/download</a>　客户端更新接口：<span class="code">/api/update/check</span></p>
      <table>
        <thead>
          <tr>
            <th>版本</th>
            <th>文件</th>
            <th>大小</th>
            <th>发布时间</th>
            <th>说明</th>
            <th>下载</th>
          </tr>
        </thead>
        <tbody id="releaseRows">
          <tr><td colspan="6" class="muted">正在加载...</td></tr>
        </tbody>
      </table>
    </section>
  </main>
  <script>
    const tokenInput = document.getElementById("token");
    const statusEl = document.getElementById("status");
    const rowsEl = document.getElementById("rows");
    const releaseStatusEl = document.getElementById("releaseStatus");
    const releaseRowsEl = document.getElementById("releaseRows");

    function setStatus(text, danger = false) {
      statusEl.textContent = text || "";
      statusEl.className = danger ? "status danger" : "status";
    }
    function setReleaseStatus(text, danger = false) {
      releaseStatusEl.textContent = text || "";
      releaseStatusEl.className = danger ? "status danger" : "status";
    }

    function fmtTime(value) {
      if (!value) return "";
      const date = typeof value === "number" ? new Date(value) : new Date(String(value));
      return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
    }

    async function api(path, options = {}) {
      const headers = { "x-admin-token": tokenInput.value.trim(), ...(options.headers || {}) };
      const res = await fetch(path, { ...options, headers });
      const data = await res.json();
      if (!res.ok || data.success === false) throw new Error(data.message || "请求失败");
      return data;
    }

    async function loadLicenses() {
      try {
        const data = await api("/admin/licenses");
        const licenses = data.licenses || [];
        rowsEl.innerHTML = licenses.length ? licenses.map((item) => {
          const devices = item.devices || [];
          const deviceText = devices.length ? devices.map((device) => device.deviceId + " / " + fmtTime(device.activatedAt)).join("<br>") : "<span class='muted'>未绑定</span>";
          const statusClass = item.status === "used" ? "ok" : item.status === "banned" ? "danger" : "muted";
          return "<tr>" +
            "<td class='code'>" + item.code + "</td>" +
            "<td class='" + statusClass + "'>" + item.status + "</td>" +
            "<td>" + deviceText + "</td>" +
            "<td>" + item.expiresAt + "</td>" +
            "<td>" + fmtTime(item.createdAt) + "</td>" +
            "<td><button class='secondary' data-copy='" + item.code + "'>复制</button></td>" +
          "</tr>";
        }).join("") : "<tr><td colspan='6' class='muted'>暂无卡密</td></tr>";
        setStatus("已刷新，共 " + licenses.length + " 张卡密。");
      } catch (error) {
        rowsEl.innerHTML = "<tr><td colspan='6' class='danger'>" + error.message + "</td></tr>";
        setStatus(error.message, true);
      }
    }

    async function createLicenses() {
      try {
        const body = {
          count: Number(document.getElementById("count").value || 1),
          maxDevices: Number(document.getElementById("maxDevices").value || 1),
          expiresAt: document.getElementById("expiresAt").value.trim()
        };
        const data = await api("/admin/licenses/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        setStatus("已生成：" + (data.licenses || []).map((item) => item.code).join("，"));
        await loadLicenses();
      } catch (error) {
        setStatus(error.message, true);
      }
    }

    function fmtSize(value) {
      const size = Number(value || 0);
      if (size > 1024 * 1024) return (size / 1024 / 1024).toFixed(1) + " MB";
      if (size > 1024) return (size / 1024).toFixed(1) + " KB";
      return size + " B";
    }

    async function loadReleases() {
      try {
        const data = await api("/admin/releases");
        const releases = data.releases || [];
        releaseRowsEl.innerHTML = releases.length ? releases.map((item) => {
          return "<tr>" +
            "<td class='code'>" + item.version + "</td>" +
            "<td>" + (item.installerFile || item.file || "") + "</td>" +
            "<td>" + fmtSize(item.fileSize) + "</td>" +
            "<td>" + fmtTime(item.publishedAt) + "</td>" +
            "<td>" + (item.notes || "") + "</td>" +
            "<td><a class='download-link' href='" + item.downloadUrl + "' target='_blank'>下载</a></td>" +
          "</tr>";
        }).join("") : "<tr><td colspan='6' class='muted'>暂无更新包</td></tr>";
        setReleaseStatus("已刷新，共 " + releases.length + " 个版本。");
      } catch (error) {
        releaseRowsEl.innerHTML = "<tr><td colspan='6' class='danger'>" + error.message + "</td></tr>";
        setReleaseStatus(error.message, true);
      }
    }

    async function uploadRelease() {
      const file = document.getElementById("releaseFile").files[0];
      const version = document.getElementById("releaseVersion").value.trim();
      const notes = document.getElementById("releaseNotes").value.trim();
      if (!version) return setReleaseStatus("请输入版本号，例如 1.1.3。", true);
        if (!file) return setReleaseStatus("请选择 exe 安装包或 zip 更新包。", true);
      try {
        setReleaseStatus("正在上传 " + file.name + " ...");
        const params = new URLSearchParams({ version, notes, fileName: file.name });
        const res = await fetch("/admin/releases/upload?" + params.toString(), {
          method: "POST",
          headers: { "x-admin-token": tokenInput.value.trim(), "Content-Type": "application/octet-stream" },
          body: file
        });
        const data = await res.json();
        if (!res.ok || data.success === false) throw new Error(data.message || "上传失败");
        setReleaseStatus("已发布版本 " + data.release.version + "。");
        await loadReleases();
      } catch (error) {
        setReleaseStatus(error.message, true);
      }
    }

    document.getElementById("createBtn").addEventListener("click", createLicenses);
    document.getElementById("refreshBtn").addEventListener("click", loadLicenses);
    document.getElementById("uploadReleaseBtn").addEventListener("click", uploadRelease);
    document.getElementById("refreshReleaseBtn").addEventListener("click", loadReleases);
    rowsEl.addEventListener("click", async (event) => {
      const code = event.target?.dataset?.copy;
      if (!code) return;
      await navigator.clipboard.writeText(code);
      setStatus("已复制：" + code);
    });
    loadLicenses();
    loadReleases();
  </script>
</body>
</html>`;
}

function downloadPage(origin) {
  const release = latestRelease("stable");
  const installerUrl = release && isValidWindowsInstaller(release) ? `${origin}/download/baiqiu-${encodeURIComponent(release.version)}-setup.exe` : "";
  const updateZipUrl = release && hasReleaseFile(release, "zip") ? `${origin}/baiqiu-${encodeURIComponent(release.version)}.zip` : "";
  const primaryUrl = installerUrl || updateZipUrl;
  const primaryLabel = installerUrl ? "下载白球 AI 安装器" : "下载兼容压缩包";
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>白球 AI 下载</title>
  <style>
    :root {
      color-scheme: dark;
      font-family: "Microsoft YaHei", "PingFang SC", Arial, sans-serif;
      background: #0b0f14;
      color: #f2f6fb;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background:
        linear-gradient(135deg, rgba(47,129,247,.20), transparent 34%),
        linear-gradient(315deg, rgba(33,191,151,.13), transparent 30%),
        #0b0f14;
    }
    main {
      width: min(920px, calc(100vw - 36px));
      margin: 0 auto;
      padding: 64px 0 44px;
    }
    .eyebrow {
      display: inline-flex;
      align-items: center;
      height: 28px;
      padding: 0 10px;
      border: 1px solid rgba(255,255,255,.12);
      border-radius: 999px;
      color: #a8d4ff;
      background: rgba(255,255,255,.05);
      font-size: 13px;
      font-weight: 700;
    }
    h1 {
      margin: 18px 0 12px;
      font-size: clamp(34px, 6vw, 56px);
      line-height: 1.05;
      letter-spacing: 0;
    }
    p { color: #aebdcb; line-height: 1.75; margin: 0; }
    .lead { max-width: 680px; font-size: 17px; color: #c9d6e3; }
    .actions {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      margin: 28px 0 20px;
    }
    a.button {
      display: inline-flex;
      min-height: 48px;
      align-items: center;
      justify-content: center;
      padding: 0 20px;
      border-radius: 10px;
      background: #2f81f7;
      color: white;
      text-decoration: none;
      font-weight: 800;
      box-shadow: 0 14px 30px rgba(47,129,247,.28);
    }
    a.secondary {
      background: rgba(255,255,255,.06);
      border: 1px solid rgba(255,255,255,.14);
      color: #e5edf6;
      box-shadow: none;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px;
      margin-top: 24px;
    }
    .panel {
      min-height: 150px;
      padding: 18px;
      border: 1px solid rgba(255,255,255,.10);
      border-radius: 10px;
      background: rgba(16,22,30,.82);
      box-shadow: 0 18px 42px rgba(0,0,0,.24);
    }
    .panel h2 {
      margin: 0 0 10px;
      font-size: 16px;
      line-height: 1.35;
      letter-spacing: 0;
    }
    .steps {
      display: grid;
      gap: 8px;
      margin: 10px 0 0;
      padding-left: 18px;
      color: #c7d2df;
      line-height: 1.65;
    }
    .warn { color: #ffcf9a; }
    code {
      padding: 2px 6px;
      border-radius: 6px;
      background: rgba(255,255,255,.08);
      color: #d8ecff;
    }
    .meta { margin-top: 18px; color: #8292a3; font-size: 13px; }
    @media (max-width: 680px) {
      main { padding-top: 42px; }
      .grid { grid-template-columns: 1fr; }
      a.button { width: 100%; }
    }
  </style>
</head>
<body>
  <main>
    <span class="eyebrow">客户稳定版下载</span>
    <h1>白球 AI</h1>
    ${release ? `
      <p class="lead">当前版本 v${release.version}。推荐 Windows 10 / Windows 11 64 位电脑使用安装器；如果电脑较旧、权限受限，或出现“此应用无法在你的电脑上运行”，请下载兼容压缩包。</p>
      <div class="actions">
        ${primaryUrl ? `<a class="button" href="${primaryUrl}">${primaryLabel}</a>` : ""}
        ${installerUrl && updateZipUrl ? `<a class="button secondary" href="${updateZipUrl}">下载兼容压缩包</a>` : ""}
      </div>
      <div class="grid">
        <section class="panel">
          <h2>推荐安装方式</h2>
          <p>适合大多数 Win10 / Win11 64 位客户。下载后双击安装器，按提示完成安装。</p>
          <ol class="steps">
            <li>保存安装器到本地磁盘。</li>
            <li>双击运行并按提示安装。</li>
            <li>首次启动如遇系统询问，选择允许运行。</li>
          </ol>
        </section>
        <section class="panel">
          <h2>兼容兜底方式</h2>
          <p class="warn">如果安装器无法打开、被拦截，或提示此应用无法在电脑上运行，请改用兼容压缩包。</p>
          <ol class="steps">
            <li>下载兼容压缩包。</li>
            <li>完整解压到桌面或 D 盘。</li>
            <li>进入文件夹后双击 <code>BaiqiuAI.exe</code> 启动。</li>
          </ol>
        </section>
      </div>` : "<p>当前暂无可下载版本，请稍后再试。</p>"}
      <p class="meta">发布时间：${release ? release.publishedAt || "" : ""}</p>
  </main>
</body>
</html>`;
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => {
      body += String(chunk);
      if (body.length > 1024 * 1024) req.destroy();
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      chunks.push(chunk);
      size += chunk.length;
      if (size > 1024 * 1024 * 1024) req.destroy(new Error("上传文件过大"));
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function saveRawBodyToFile(req, filePath, maxSize = 3 * 1024 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tempPath = `${filePath}.uploading-${Date.now()}`;
    const stream = fs.createWriteStream(tempPath);
    let size = 0;
    let finished = false;
    const fail = (error) => {
      if (finished) return;
      finished = true;
      stream.destroy();
      try { fs.unlinkSync(tempPath); } catch {}
      reject(error);
    };
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxSize) {
        req.destroy();
        fail(new Error("?????????? 3GB ???????????"));
        return;
      }
      if (!stream.write(chunk)) req.pause();
    });
    stream.on("drain", () => req.resume());
    req.on("end", () => {
      if (finished) return;
      stream.end(() => {
        finished = true;
        fs.renameSync(tempPath, filePath);
        resolve({ size });
      });
    });
    req.on("error", fail);
    stream.on("error", fail);
  });
}

function createLicenses(count = 1, expiresAt = "2099-12-31T23:59:59Z", maxDevices = 1, notes = "") {
  const db = readDb();
  db.licenses ||= [];
  const existing = new Set(db.licenses.map((item) => item.code));
  const created = [];
  while (created.length < count) {
    const code = generateCode();
    if (existing.has(code)) continue;
    existing.add(code);
    const item = {
      code,
      status: "unused",
      expiresAt,
      maxDevices,
      devices: [],
      notes,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    db.licenses.push(item);
    created.push(item);
  }
  writeDb(db);
  return created;
}

async function handleActivate(req, res) {
  const body = await readBody(req);
  const code = normalizeCode(body.code);
  const deviceId = String(body.deviceId || "").trim();
  if (!isCodeFormatValid(code)) return sendJson(res, 400, { success: false, message: "卡密格式无效" });
  if (!deviceId) return sendJson(res, 400, { success: false, message: "缺少设备 ID" });

  const db = readDb();
  const item = (db.licenses || []).find((entry) => entry.code === code);
  if (!item) return sendJson(res, 404, { success: false, message: "卡密不存在" });
  if (item.status === "banned") return sendJson(res, 403, { success: false, message: "卡密已被封禁" });
  if (item.expiresAt && Date.parse(item.expiresAt) < Date.now()) return sendJson(res, 403, { success: false, message: "卡密已过期" });

  item.devices ||= [];
  const existingDevice = item.devices.find((device) => device.deviceId === deviceId);
  if (!existingDevice && item.devices.length >= Number(item.maxDevices || 1)) {
    return sendJson(res, 403, { success: false, message: "卡密已绑定其他设备" });
  }

  if (!existingDevice) {
    item.devices.push({ deviceId, activatedAt: Date.now(), lastSeenAt: Date.now() });
    item.status = "used";
  } else {
    existingDevice.lastSeenAt = Date.now();
  }
  item.updatedAt = Date.now();
  writeDb(db);

  const expiresAt = item.expiresAt || "2099-12-31T23:59:59Z";
  return sendJson(res, 200, {
    success: true,
    code,
    expiresAt,
    signature: serverSignature(code, deviceId, expiresAt),
    message: "激活成功"
  });
}

async function handleAdminCreate(req, res) {
  if (req.headers["x-admin-token"] !== ADMIN_TOKEN) return sendJson(res, 401, { success: false, message: "管理员令牌无效" });
  const body = await readBody(req);
  const count = Math.max(1, Math.min(500, Number(body.count || 1)));
  const expiresAt = String(body.expiresAt || "2099-12-31T23:59:59Z");
  const maxDevices = Math.max(1, Math.min(20, Number(body.maxDevices || 1)));
  const notes = String(body.notes || "");
  const created = createLicenses(count, expiresAt, maxDevices, notes);
  return sendJson(res, 200, { success: true, licenses: created });
}

async function handleAdminList(req, res) {
  if (req.headers["x-admin-token"] !== ADMIN_TOKEN) return sendJson(res, 401, { success: false, message: "管理员令牌无效" });
  return sendJson(res, 200, { success: true, licenses: readDb().licenses || [] });
}

async function handleAdminReleases(req, res, origin) {
  if (req.headers["x-admin-token"] !== ADMIN_TOKEN) return sendJson(res, 401, { success: false, message: "管理员令牌无效" });
  const manifest = readJson(MANIFEST_PATH, { channels: { stable: [] } });
  const releases = (manifest.channels?.stable || [])
    .slice()
    .sort((a, b) => compareVersion(b.version, a.version))
    .map((item) => {
      const filePath = path.join(RELEASES_DIR, item.installerFile || item.file || "");
      return {
        ...item,
        fileSize: fs.existsSync(filePath) ? fs.statSync(filePath).size : 0,
        downloadUrl: item.installerFile
          ? `${origin}/download/baiqiu-${encodeURIComponent(item.version)}-setup.exe`
          : `${origin}/baiqiu-${encodeURIComponent(item.version)}.zip`
      };
    });
  return sendJson(res, 200, { success: true, releases, latest: releases[0] || null });
}

async function handleAdminReleaseUpload(req, res, url) {
  if (req.headers["x-admin-token"] !== ADMIN_TOKEN) return sendJson(res, 401, { success: false, message: "???????" });
  const version = String(url.searchParams.get("version") || "").trim();
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
    return sendJson(res, 400, { success: false, message: "??????? 1.0.1" });
  }
  const notes = String(url.searchParams.get("notes") || "??????").trim();
  const originalFileName = String(url.searchParams.get("fileName") || "").trim();
  fs.mkdirSync(RELEASES_DIR, { recursive: true });
  const isInstaller = /\.exe$/i.test(originalFileName);
  const file = isInstaller ? "" : `baiqiu-customer-${version}.zip`;
  const installerFile = isInstaller ? `BaiqiuAI-Setup-${version}.exe` : "";
  const filePath = path.join(RELEASES_DIR, installerFile || file);
  const uploaded = await saveRawBodyToFile(req, filePath);
  if (!uploaded.size) return sendJson(res, 400, { success: false, message: "??????" });
  if (isInstaller && !isValidWindowsInstaller({ installerFile })) {
    try { fs.unlinkSync(filePath); } catch {}
    return sendJson(res, 400, { success: false, message: "??????????? Windows ??????" });
  }
  const release = saveRelease({ version, file, installerFile, notes, forceUpdate: true });
  return sendJson(res, 200, { success: true, release });
}

function sendReleaseFile(req, res, release, type = "zip") {
  const releaseFile = type === "installer" ? release?.installerFile : release?.file;
  if (!releaseFile) return sendJson(res, 404, { success: false, message: type === "installer" ? "?????" : "?????" });
  const file = path.join(RELEASES_DIR, releaseFile);
  if (!fs.existsSync(file)) return sendJson(res, 404, { success: false, message: "??????" });
  if (type === "installer" && !isValidWindowsInstaller(release)) return sendJson(res, 409, { success: false, message: "??????????????????" });
  const isInstaller = /\.exe$/i.test(releaseFile);
  res.writeHead(200, {
    "Content-Type": isInstaller ? "application/vnd.microsoft.portable-executable" : "application/zip",
    "Content-Length": fs.statSync(file).size,
    "Content-Disposition": `attachment; filename="${path.basename(file)}"`
  });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);
  const origin = `${url.protocol}//${url.host}`;
  if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/admin")) return sendHtml(res, adminPage());
  if (req.method === "GET" && url.pathname === "/download") return sendHtml(res, downloadPage(origin));
  if (req.method === "GET" && url.pathname === "/health") return sendJson(res, 200, { success: true, service: "baiqiu-license-server" });
  if (req.method === "POST" && url.pathname === "/api/license/activate") return handleActivate(req, res);
  if (req.method === "POST" && url.pathname === "/admin/licenses/create") return handleAdminCreate(req, res);
  if (req.method === "GET" && url.pathname === "/admin/licenses") return handleAdminList(req, res);
  if (req.method === "GET" && url.pathname === "/admin/releases") return handleAdminReleases(req, res, origin);
  if (req.method === "POST" && url.pathname === "/admin/releases/upload") return handleAdminReleaseUpload(req, res, url);
  if (req.method === "GET" && (url.pathname === "/manifest.json" || url.pathname === "/baiqiu-update.json")) {
    const release = latestUpdateRelease("stable");
    const downloadRelease = latestRelease("stable");
    return sendJson(res, 200, {
      name: "白球 AI",
      version: release?.version || downloadRelease?.version || "0.0.0",
      latestVersion: release?.version || downloadRelease?.version || "0.0.0",
      packageUrl: release ? `${origin}/baiqiu-${encodeURIComponent(release.version)}.zip` : "",
      downloadUrl: release ? `${origin}/baiqiu-${encodeURIComponent(release.version)}.zip` : "",
      installerUrl: downloadRelease?.installerFile ? `${origin}/download/baiqiu-${encodeURIComponent(downloadRelease.version)}-setup.exe` : "",
      sha256: release?.sha256 || "",
      checksum: release?.sha256 || "",
      installerSha256: downloadRelease?.installerSha256 || "",
      notes: (release?.notes || downloadRelease?.notes) ? [release?.notes || downloadRelease?.notes] : ["暂无更新"]
    });
  }
  if (req.method === "GET" && url.pathname === "/update.json") {
    const release = latestUpdateRelease("stable");
    const downloadRelease = latestRelease("stable");
    return sendJson(res, 200, {
      version: release?.version || "0.0.0",
      downloadUrl: release ? `${origin}/baiqiu-${encodeURIComponent(release.version)}.zip` : "",
      installerUrl: downloadRelease?.installerFile ? `${origin}/download/baiqiu-${encodeURIComponent(downloadRelease.version)}-setup.exe` : "",
      forceUpdate: Boolean(release?.forceUpdate),
      changelog: release?.notes || "暂无更新"
    });
  }
  if (req.method === "GET" && url.pathname === "/api/update/check") {
    const version = url.searchParams.get("version") || "0.0.0";
    const release = latestUpdateRelease("stable");
    if (!release) return sendJson(res, 200, { hasUpdate: false, latestVersion: version, message: "暂无更新" });
    const hasUpdate = compareVersion(release.version, version) > 0;
    return sendJson(res, 200, {
      hasUpdate,
      latestVersion: release.version,
      releaseNotes: release.notes || "",
      downloadUrl: hasUpdate ? `${origin}/api/update/download?version=${encodeURIComponent(release.version)}` : "",
      fileSize: fs.existsSync(path.join(RELEASES_DIR, release.file)) ? fs.statSync(path.join(RELEASES_DIR, release.file)).size : 0,
      checksum: release.sha256 || ""
    });
  }
  if (req.method === "GET" && url.pathname === "/api/update/download") return sendReleaseFile(req, res, latestUpdateRelease("stable"));
  const canDownload = req.method === "GET" || req.method === "HEAD";
  const installerMatch = url.pathname.match(/^\/download\/baiqiu-([^/]+)-setup\.exe$/i);
  if (canDownload && installerMatch) {
    const version = decodeURIComponent(installerMatch[1]);
    const release = (readJson(MANIFEST_PATH, { channels: {} }).channels?.stable || []).find((item) => item.version === version);
    return sendReleaseFile(req, res, release, "installer");
  }
  const directZipMatch = url.pathname.match(/^\/baiqiu-([^/]+)\.zip$/i);
  if (canDownload && directZipMatch) {
    const version = decodeURIComponent(directZipMatch[1]);
    const release = (readJson(MANIFEST_PATH, { channels: {} }).channels?.stable || []).find((item) => item.version === version);
    return sendReleaseFile(req, res, release);
  }
  return sendJson(res, 404, { success: false, message: "Not found" });
});

if (process.argv[2] === "create") {
  const count = Math.max(1, Math.min(500, Number(process.argv[3] || 1)));
  const created = createLicenses(count);
  console.log(created.map((item) => item.code).join("\n"));
} else {
  fs.mkdirSync(RELEASES_DIR, { recursive: true });
  server.listen(PORT, HOST, () => {
    console.log(`Baiqiu license server listening at http://${HOST}:${PORT}`);
    console.log(`Admin token: ${ADMIN_TOKEN}`);
  });
}
