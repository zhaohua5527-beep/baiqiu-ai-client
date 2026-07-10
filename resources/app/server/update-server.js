const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const RELEASES_DIR = path.join(ROOT, "releases");
const DOWNLOADS_DIR = path.join(ROOT, "downloads");
const MANIFEST_PATH = path.join(ROOT, "updates.json");
const UPDATE_JSON_PATH = path.join(ROOT, "update.json");

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "")); } catch { return fallback; }
}

function compareVersion(a, b) {
  const normalize = (value) => String(value || "0.0.0")
    .trim()
    .replace(/^v/i, "")
    .split(/[+-]/)[0]
    .split(".")
    .map((part) => {
      const match = String(part || "0").match(/^\d+/);
      return match ? Number(match[0]) : 0;
    });
  const pa = normalize(a);
  const pb = normalize(b);
  for (let i = 0; i < Math.max(pa.length, pb.length, 3); i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

function checksum(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function latestRelease(channel = "stable") {
  const manifest = readJson(MANIFEST_PATH, { channels: {} });
  const list = manifest.channels?.[channel] || manifest.channels?.stable || [];
  return [...list].sort((a, b) => compareVersion(b.version, a.version))[0] || null;
}

function sendJson(res, data, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

function validInvite(inviteCode) {
  return Boolean(String(inviteCode || "").trim());
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if ((url.pathname === "/baiqiu-update.json" || url.pathname === "/manifest.json") && req.method === "GET") {
    const release = latestRelease("stable");
    const testZip = path.join(DOWNLOADS_DIR, "baiqiu-update.zip");
    const hasRelease = Boolean(release?.file);
    const hasTestZip = fs.existsSync(testZip);
    return sendJson(res, {
      name: "白球 AI",
      version: release?.version || "0.1.1",
      latestVersion: release?.version || "0.1.1",
      packageUrl: hasRelease
        ? `${url.origin}/api/update/download?channel=stable&version=${encodeURIComponent(release.version)}&inviteCode=LOCAL`
        : (hasTestZip ? `${url.origin}/downloads/baiqiu-update.zip` : ""),
      sha256: hasRelease ? (release.sha256 || "") : (hasTestZip ? checksum(testZip) : ""),
      notes: release?.notes ? [release.notes] : ["暂无更新"],
    });
  }

  if (url.pathname === "/update.json" && req.method === "GET") {
    const published = readJson(UPDATE_JSON_PATH, null);
    if (published?.version && published?.downloadUrl) {
      return sendJson(res, {
        version: String(published.version),
        downloadUrl: String(published.downloadUrl).replace(/^http:\/\/localhost:3000/i, url.origin),
        forceUpdate: Boolean(published.forceUpdate),
        changelog: String(published.changelog || "")
      });
    }
    const release = latestRelease("stable");
    if (!release?.file) {
      return sendJson(res, {
        version: "0.0.0",
        downloadUrl: "",
        forceUpdate: false,
        changelog: "暂无更新"
      });
    }
    return sendJson(res, {
      version: release.version,
      downloadUrl: `${url.origin}/baiqiu-${encodeURIComponent(release.version)}.zip`,
      forceUpdate: release.forceUpdate !== undefined ? Boolean(release.forceUpdate) : true,
      changelog: release.notes || release.changelog || "白球 AI 更新"
    });
  }

  if (url.pathname === "/downloads/baiqiu-update.zip" && req.method === "GET") {
    const file = path.join(DOWNLOADS_DIR, "baiqiu-update.zip");
    if (!fs.existsSync(file)) return sendJson(res, { message: "更新包不存在" }, 404);
    res.writeHead(200, {
      "Content-Type": "application/zip",
      "Content-Length": fs.statSync(file).size,
      "Content-Disposition": "attachment; filename=\"baiqiu-update.zip\""
    });
    fs.createReadStream(file).pipe(res);
    return;
  }

  const directZipMatch = url.pathname.match(/^\/baiqiu-([^/]+)\.zip$/i);
  if (directZipMatch && req.method === "GET") {
    const version = decodeURIComponent(directZipMatch[1]);
    const release = (readJson(MANIFEST_PATH, { channels: {} }).channels?.stable || [])
      .find((item) => item.version === version);
    if (!release?.file) return sendJson(res, { message: "暂无更新包" }, 404);
    const file = path.join(RELEASES_DIR, release.file);
    if (!fs.existsSync(file)) return sendJson(res, { message: "更新包不存在" }, 404);
    res.writeHead(200, {
      "Content-Type": "application/zip",
      "Content-Length": fs.statSync(file).size,
      "Content-Disposition": `attachment; filename="baiqiu-${release.version}.zip"`
    });
    fs.createReadStream(file).pipe(res);
    return;
  }

  if (url.pathname === "/api/activate" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      try {
        const data = JSON.parse(body || "{}");
        const file = path.join(ROOT, "data", "activations.json");
        const records = readJson(file, []);
        const existing = records.find((item) => item.machineId === data.machineId);
        if (existing) {
          Object.assign(existing, data, { status: "active", lastSeen: new Date().toISOString() });
        } else {
          records.push({ ...data, status: "active", lastSeen: new Date().toISOString() });
        }
        writeJson(file, records);
        console.log(`[激活] ${data.userName || "客户"} (${String(data.machineId || "").slice(0, 8)})`);
        sendJson(res, { ok: true });
      } catch (error) {
        sendJson(res, { ok: false, error: error.message || String(error) }, 400);
      }
    });
    return;
  }

  if (url.pathname === "/api/activations" && req.method === "GET") {
    const records = readJson(path.join(ROOT, "data", "activations.json"), []);
    return sendJson(res, {
      total: records.length,
      active: records.filter((item) => item.status === "active").length,
      records: records.slice(-100)
    });
  }

  if (url.pathname === "/api/update/check") {
    const version = url.searchParams.get("version") || "0.0.0";
    const inviteCode = url.searchParams.get("inviteCode") || "";
    const channel = url.searchParams.get("channel") || "stable";
    if (!validInvite(inviteCode)) return sendJson(res, { hasUpdate: false, message: "缺少有效卡密" }, 403);
    const release = latestRelease(channel);
    if (!release) return sendJson(res, { hasUpdate: false, latestVersion: version, message: "暂无更新" });
    const hasUpdate = compareVersion(release.version, version) > 0;
    return sendJson(res, {
      hasUpdate,
      latestVersion: release.version,
      releaseNotes: release.notes || "",
      downloadUrl: hasUpdate ? `${url.origin}/api/update/download?channel=${encodeURIComponent(channel)}&version=${encodeURIComponent(release.version)}&inviteCode=${encodeURIComponent(inviteCode)}` : "",
      fileSize: release.file ? fs.statSync(path.join(RELEASES_DIR, release.file)).size : 0,
      checksum: release.sha256 || (release.file ? checksum(path.join(RELEASES_DIR, release.file)) : "")
    });
  }

  if (url.pathname === "/api/update/download") {
    const inviteCode = url.searchParams.get("inviteCode") || "";
    const channel = url.searchParams.get("channel") || "stable";
    if (!validInvite(inviteCode)) return sendJson(res, { message: "缺少有效卡密" }, 403);
    const release = latestRelease(channel);
    if (!release?.file) return sendJson(res, { message: "暂无更新包" }, 404);
    const file = path.join(RELEASES_DIR, release.file);
    if (!fs.existsSync(file)) return sendJson(res, { message: "更新包不存在" }, 404);
    res.writeHead(200, {
      "Content-Type": "application/zip",
      "Content-Length": fs.statSync(file).size,
      "Content-Disposition": `attachment; filename="${path.basename(file)}"`
    });
    fs.createReadStream(file).pipe(res);
    return;
  }

  sendJson(res, { ok: true, service: "Baiqiu update server" });
});

server.listen(PORT, () => {
  fs.mkdirSync(RELEASES_DIR, { recursive: true });
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
  console.log(`[更新服务器] 运行在 http://localhost:${PORT}`);
});
