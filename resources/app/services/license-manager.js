const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const https = require("node:https");
const crypto = require("node:crypto");
const { execSync } = require("node:child_process");

const CHARSET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const SALT = "BaiqiuAI2026Salt";
const DEFAULT_ACTIVATE_SERVER = "https://your-license-server.com";
const DEFAULT_SERVER_SECRET = "BaiqiuAICommercialServerSecretChangeMe";
const REG_PATH = "HKCU\\Software\\BaiqiuAI";
const REG_VALUE = "TrialData";

class LicenseManager {
  constructor(options = {}) {
    this.dbPath = options.dbPath || path.join(os.homedir(), "AppData", "Roaming", "Baiqiu AI", "heiqiu-db.json");
    this.keysPath = options.keysPath || path.join(os.homedir(), "AppData", "Roaming", "Baiqiu AI", "keys.json");
    this.trialLimit = options.trialLimit || 30 * 60;
    this.trialWarnAt = options.trialWarnAt || 5 * 60;
    this.activateServer = options.activateServer || DEFAULT_ACTIVATE_SERVER;
    this.serverSecret = options.serverSecret || process.env.BAIQIU_LICENSE_SERVER_SECRET || DEFAULT_SERVER_SECRET;
    this.deviceId = this._generateDeviceId();
    this.signKey = `${this.deviceId}${SALT}`;
    this.adminKey = crypto.createHash("sha256").update(`admin:${this.deviceId}:${SALT}`).digest();
  }

  updateConfig(options = {}) {
    if (options.activateServer) this.activateServer = options.activateServer;
    if (options.serverSecret) this.serverSecret = options.serverSecret;
  }

  getStatus() {
    const db = this._readDb();
    const license = this._ensureLicense(db);
    let changed = false;

    const local = this.verifyLocal(license);
    if (license.unlocked && !local.ok) {
      this._lockLicense(license, local.message || "本地许可证校验失败");
      changed = true;
    } else if (local.ok) {
      license.unlocked = true;
      license.locked = false;
      license.lockReason = "";
    }

    if (!license.unlocked) {
      changed = this._mergeTrialMirror(license) || changed;
      if (!license.trialStartAt) {
        const now = Date.now();
        license.trialStartAt = now;
        license.trialLastTickAt = now;
        license.trialUsedSeconds = 0;
        license.locked = false;
        changed = true;
      }
      changed = this.updateTrial(0, db) || changed;
    }

    this._signLicense(license);
    if (changed) this._writeDb(db);
    return this._publicStatus(license);
  }

  startTrial() {
    const db = this._readDb();
    const license = this._ensureLicense(db);
    this._mergeTrialMirror(license);
    const now = Date.now();
    if (!license.trialStartAt) {
      license.trialStartAt = now;
      license.trialLastTickAt = now;
      license.trialUsedSeconds = 0;
      license.locked = false;
    }
    this._signLicense(license);
    this._writeDb(db);
    this._writeTrialMirror(license);
    return this._publicStatus(license);
  }

  updateTrial(seconds = 0, existingDb = null) {
    const db = existingDb || this._readDb();
    const license = this._ensureLicense(db);
    if (license.unlocked) return false;

    this._mergeTrialMirror(license);
    const now = Date.now();
    if (!license.trialStartAt) {
      license.trialStartAt = now;
      license.trialLastTickAt = now;
      license.trialUsedSeconds = 0;
    }

    const elapsed = seconds > 0
      ? Number(seconds)
      : Math.max(0, Math.floor((now - Number(license.trialLastTickAt || now)) / 1000));
    license.trialUsedSeconds = Math.max(0, Number(license.trialUsedSeconds || 0) + elapsed);
    license.trialLastTickAt = now;
    license.locked = license.trialUsedSeconds >= this.trialLimit;
    license.lockReason = license.locked ? "免费试用已结束，请输入卡密激活。" : "";
    this._signLicense(license);
    this._writeTrialMirror(license);
    if (!existingDb) this._writeDb(db);
    return true;
  }

  async verifyCode(code, customer = {}) {
    const normalized = this._normalizeCode(code);
    if (!this._isCodeFormatValid(normalized)) {
      return { ok: false, success: false, message: "卡密格式无效" };
    }

    const online = await this.verifyCodeOnline(normalized, this.deviceId);
    if (!online.success) {
      return { ok: false, success: false, code: normalized, message: online.message || "卡密联网激活失败" };
    }

    const expiresAt = online.expiresAt || "2099-12-31T23:59:59Z";
    const serverSignature = online.signature || this._serverSignature(normalized, this.deviceId, expiresAt);
    if (!this._verifyServerSignature(normalized, this.deviceId, expiresAt, serverSignature)) {
      return { ok: false, success: false, code: normalized, message: "服务器签名校验失败" };
    }

    this._activateLicense(normalized, expiresAt, serverSignature, "online", customer);

    return {
      ok: true,
      success: true,
      code: normalized,
      expiresAt,
      message: online.message || "激活成功，当前设备已永久解锁。"
    };
  }

  activateOfflineInvite(code, expiresAt = "2099-12-31T23:59:59Z", customer = {}) {
    const normalized = String(code || "").trim().toUpperCase();
    const serverSignature = this._serverSignature(normalized, this.deviceId, expiresAt);
    this._activateLicense(normalized, expiresAt, serverSignature, "offline-invite", customer);
    return {
      ok: true,
      success: true,
      code: normalized,
      expiresAt,
      message: "邀请码有效，当前设备已解锁。"
    };
  }

  verifyCodeOnline(code, deviceId = this.deviceId) {
    const body = {
      code,
      deviceId,
      timestamp: Date.now()
    };
    return this._requestJson("POST", "/api/license/activate", body);
  }

  _activateLicense(code, expiresAt, serverSignature, activationMode, customer = {}) {
    const db = this._readDb();
    const license = this._ensureLicense(db);
    license.state = "activated";
    license.type = "permanent";
    license.unlocked = true;
    license.locked = false;
    license.lockReason = "";
    license.inviteCode = code;
    license.activatedAt = Date.now();
    license.expiresAt = expiresAt || "2099-12-31T23:59:59Z";
    license.activatedCode = this._encryptField(code);
    license.deviceIdEncrypted = this._encryptField(this.deviceId);
    license.serverSignature = serverSignature;
    license.activationMode = activationMode || "online";
    license.customer = {
      name: String(customer.name || "").trim(),
      phone: String(customer.phone || "").trim()
    };
    license.trialStartAt = null;
    license.trialLastTickAt = null;
    license.trialUsedSeconds = 0;
    this._signLicense(license);
    this._writeDb(db);
    this._clearTrialMirror();
  }

  verifyLocal(existingLicense = null) {
    const license = existingLicense || this._ensureLicense(this._readDb());
    if (!license.unlocked) return { ok: false, message: "未激活" };
    if (!this._verifyLicense(license).ok) return { ok: false, message: "本地签名不匹配" };

    const boundDevice = this._decryptField(license.deviceIdEncrypted || "");
    if (!boundDevice || boundDevice !== this.deviceId) return { ok: false, message: "设备指纹不匹配" };

    const code = this._decryptField(license.activatedCode || "") || license.inviteCode || "";
    if (!code) return { ok: false, message: "本地许可证缺少卡密" };
    const expiresAt = license.expiresAt || "2099-12-31";
    if (this._isExpired(expiresAt)) return { ok: false, message: "许可证已过期" };
    if (!this._verifyServerSignature(code, boundDevice, expiresAt, license.serverSignature || "")) {
      return { ok: false, message: "服务器签名不匹配" };
    }

    return { ok: true, message: "本地离线校验通过" };
  }

  lock(message = "许可证已锁定") {
    const db = this._readDb();
    const license = this._ensureLicense(db);
    this._lockLicense(license, message);
    this._signLicense(license);
    this._writeDb(db);
    return this._publicStatus(license);
  }

  getRemainingTrial() {
    return this.getStatus().trialRemainingSeconds;
  }

  trialInfo() {
    return this.getStatus();
  }

  generateCodes(count = 1, type = "lifetime", notes = "") {
    const total = Math.max(1, Math.min(500, Number(count) || 1));
    const keys = this._readKeys();
    const existing = new Set(keys.map((item) => item.code));
    const generated = [];
    while (generated.length < total) {
      const code = this._generateCode();
      if (existing.has(code)) continue;
      existing.add(code);
      const item = {
        code,
        type: type || "lifetime",
        expiresAt: "2099-12-31T23:59:59Z",
        notes: String(notes || ""),
        status: "unused",
        createdAt: Date.now(),
        deviceId: "",
        activatedAt: null
      };
      keys.push(item);
      generated.push(code);
    }
    this._writeKeys(keys);
    return generated;
  }

  exportCodes(format = "txt") {
    const keys = this._readKeys();
    if (String(format).toLowerCase() === "csv") {
      return ["code,type,status,deviceId,createdAt,activatedAt,notes"]
        .concat(keys.map((item) => [item.code, item.type, item.status, item.deviceId, item.createdAt, item.activatedAt || "", JSON.stringify(item.notes || "")].join(",")))
        .join("\n");
    }
    return keys.map((item) => `${item.code} ${item.status} ${item.notes || ""}`.trim()).join("\n");
  }

  getCodeList() {
    return this._readKeys().map((item) => ({ ...item, deviceId: item.deviceId ? `${item.deviceId.slice(0, 8)}...` : "" }));
  }

  manageCode(code, action) {
    const normalized = this._normalizeCode(code);
    const keys = this._readKeys();
    const item = keys.find((entry) => entry.code === normalized);
    if (!item) return { ok: false, message: "卡密不存在" };
    if (action === "ban") item.status = "banned";
    else if (action === "unbind") {
      item.status = "unused";
      item.deviceId = "";
      item.activatedAt = null;
    } else {
      return { ok: false, message: "未知操作" };
    }
    this._writeKeys(keys);
    return { ok: true, message: "操作完成", item };
  }

  _requestJson(method, urlPath, body = null) {
    return new Promise((resolve) => {
      let url;
      try {
        url = new URL(urlPath, this.activateServer);
      } catch (error) {
        resolve({ success: false, message: `激活服务器地址无效: ${error.message}` });
        return;
      }

      const payload = body ? JSON.stringify(body) : "";
      const protocol = url.protocol === "https:" ? https : http;
      const req = protocol.request({
        method,
        hostname: url.hostname,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        timeout: 12000,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload)
        }
      }, (res) => {
        let data = "";
        res.on("data", (chunk) => { data += String(chunk); });
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data || "{}");
            if (res.statusCode >= 400) {
              resolve({ success: false, message: parsed.message || `激活服务器返回 ${res.statusCode}` });
            } else {
              resolve(parsed);
            }
          } catch {
            resolve({ success: false, message: "激活服务器响应不是有效 JSON" });
          }
        });
      });
      req.on("timeout", () => req.destroy(new Error("激活服务器连接超时")));
      req.on("error", (error) => resolve({ success: false, message: `激活服务器连接失败: ${error.message}` }));
      if (payload) req.write(payload);
      req.end();
    });
  }

  _publicStatus(license) {
    const used = Math.max(0, Number(license.trialUsedSeconds || 0));
    const remaining = Math.max(0, this.trialLimit - used);
    return {
      state: license.unlocked ? "activated" : license.locked ? "expired" : "trial",
      unlocked: Boolean(license.unlocked),
      locked: Boolean(license.locked) && !license.unlocked,
      trialStartAt: license.trialStartAt || null,
      trialUsedSeconds: used,
      trialRemainingSeconds: remaining,
      trialLimit: this.trialLimit,
      shouldWarn: !license.unlocked && remaining > 0 && remaining <= this.trialWarnAt,
      inviteCode: license.inviteCode || "",
      expiresAt: license.expiresAt || "",
      deviceId: `${this.deviceId.slice(0, 8)}...`,
      message: license.lockReason || ""
    };
  }

  _ensureLicense(db) {
    db.settings ||= {};
    db.settings.license ||= {};
    return db.settings.license;
  }

  _lockLicense(license, message) {
    license.unlocked = false;
    license.locked = true;
    license.state = "locked";
    license.lockReason = message;
  }

  _generateDeviceId() {
    let mac = "";
    let guid = "";
    let board = "";
    let cpu = "";
    try { mac = execSync("getmac /fo csv /nh", { windowsHide: true, timeout: 3000 }).toString().split(",")[0].replace(/\"/g, ""); } catch {}
    try { guid = execSync("reg query HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography /v MachineGuid", { windowsHide: true, timeout: 3000 }).toString().split("REG_SZ")[1].trim(); } catch {}
    try { board = execSync("wmic baseboard get serialnumber", { windowsHide: true, timeout: 3000 }).toString().split("\n")[1].trim(); } catch {}
    try { cpu = execSync("wmic cpu get processorid", { windowsHide: true, timeout: 3000 }).toString().split("\n")[1].trim(); } catch {}
    return crypto.createHash("sha256").update(`${mac}|${guid}|${board}|${cpu}`).digest("hex").substring(0, 32);
  }

  _licensePayload(license) {
    return {
      unlocked: Boolean(license.unlocked),
      locked: Boolean(license.locked),
      trialStartAt: Number(license.trialStartAt || 0),
      trialUsedSeconds: Number(license.trialUsedSeconds || 0),
      deviceIdEncrypted: license.deviceIdEncrypted || "",
      activatedCode: license.activatedCode || "",
      expiresAt: license.expiresAt || "",
      serverSignature: license.serverSignature || ""
    };
  }

  _sign(data) {
    return crypto.createHmac("sha256", this.signKey).update(JSON.stringify(data)).digest("hex");
  }

  _verify(data, signature) {
    if (!signature) return false;
    const expected = this._sign(data);
    if (expected.length !== String(signature).length) return false;
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(signature)));
  }

  _signLicense(license) {
    license.signature = this._sign(this._licensePayload(license));
  }

  _verifyLicense(license) {
    return { ok: this._verify(this._licensePayload(license), license.signature || "") };
  }

  _serverSignature(code, deviceId, expiresAt) {
    const data = `${code}${deviceId}${expiresAt}${this.serverSecret}`;
    return crypto.createHmac("sha256", this.serverSecret).update(data).digest("hex");
  }

  _verifyServerSignature(code, deviceId, expiresAt, signature) {
    if (!signature) return false;
    const expected = this._serverSignature(code, deviceId, expiresAt);
    return expected.length === String(signature).length
      && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(signature)));
  }

  _isExpired(expiresAt) {
    if (!expiresAt || String(expiresAt).toLowerCase() === "lifetime") return false;
    const time = Date.parse(expiresAt);
    return Number.isFinite(time) && time < Date.now();
  }

  _normalizeCode(code) {
    return String(code || "").toUpperCase().replace(/[^23456789ABCDEFGHJKLMNPQRSTUVWXYZ]/g, "").replace(/(.{4})(?=.)/g, "$1-").slice(0, 19);
  }

  _isCodeFormatValid(code) {
    if (!/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}(?:-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}){3}$/.test(code)) return false;
    return code.split("-").every((group) => this._checkChar(group.slice(0, 3)) === group[3]);
  }

  _checkChar(value) {
    const sum = [...value].reduce((total, char) => total + char.charCodeAt(0), 0);
    return CHARSET[sum % CHARSET.length];
  }

  _generateCode() {
    const groups = [];
    for (let i = 0; i < 4; i++) {
      let raw = "";
      for (let j = 0; j < 3; j++) raw += CHARSET[crypto.randomInt(0, CHARSET.length)];
      groups.push(`${raw}${this._checkChar(raw)}`);
    }
    return groups.join("-");
  }

  _encryptField(value) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-cbc", crypto.createHash("sha256").update(this.signKey).digest(), iv);
    const encrypted = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
    return `${iv.toString("hex")}:${encrypted.toString("hex")}`;
  }

  _decryptField(value) {
    try {
      const [ivHex, dataHex] = String(value || "").split(":");
      if (!ivHex || !dataHex) return "";
      const decipher = crypto.createDecipheriv("aes-256-cbc", crypto.createHash("sha256").update(this.signKey).digest(), Buffer.from(ivHex, "hex"));
      return Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]).toString("utf8");
    } catch {
      return "";
    }
  }

  _mergeTrialMirror(license) {
    const mirror = this._readTrialMirror();
    if (!mirror) return false;
    let changed = false;
    const mirrorStart = Number(mirror.trialStartAt || 0);
    const localStart = Number(license.trialStartAt || 0);
    if (mirrorStart && (!localStart || mirrorStart < localStart)) {
      license.trialStartAt = mirrorStart;
      changed = true;
    }
    const mirrorUsed = Number(mirror.trialUsedSeconds || 0);
    const localUsed = Number(license.trialUsedSeconds || 0);
    if (mirrorUsed > localUsed) {
      license.trialUsedSeconds = mirrorUsed;
      changed = true;
    }
    if (mirror.locked && !license.unlocked) {
      license.locked = true;
      license.lockReason = "免费试用已结束，请输入卡密激活。";
      changed = true;
    }
    return changed;
  }

  _trialMirrorPayload(license) {
    return {
      trialStartAt: Number(license.trialStartAt || 0),
      trialUsedSeconds: Number(license.trialUsedSeconds || 0),
      locked: Boolean(license.locked),
      deviceId: this.deviceId,
      savedAt: Date.now()
    };
  }

  _writeTrialMirror(license) {
    try {
      const encrypted = this._encryptField(JSON.stringify(this._trialMirrorPayload(license)));
      execSync(`reg add "${REG_PATH}" /v ${REG_VALUE} /t REG_SZ /d "${encrypted}" /f`, { windowsHide: true, timeout: 3000 });
    } catch {}
  }

  _clearTrialMirror() {
    try {
      execSync(`reg delete "${REG_PATH}" /v ${REG_VALUE} /f`, { windowsHide: true, timeout: 3000, stdio: "ignore" });
    } catch {}
  }

  _readTrialMirror() {
    try {
      const output = execSync(`reg query "${REG_PATH}" /v ${REG_VALUE}`, { windowsHide: true, timeout: 3000 }).toString();
      const match = output.match(new RegExp(`${REG_VALUE}\\s+REG_SZ\\s+([^\\r\\n]+)`));
      if (!match) return null;
      const decrypted = this._decryptField(match[1].trim());
      const payload = JSON.parse(decrypted);
      if (payload.deviceId && payload.deviceId !== this.deviceId) return null;
      return payload;
    } catch {
      return null;
    }
  }

  _readDb() {
    try {
      return JSON.parse(fs.readFileSync(this.dbPath, "utf8"));
    } catch {
      return { settings: { license: {} } };
    }
  }

  _writeDb(db) {
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
    const tmp = `${this.dbPath}.license-tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2), "utf8");
    fs.renameSync(tmp, this.dbPath);
  }

  _readKeys() {
    if (!fs.existsSync(this.keysPath)) return [];
    try {
      const raw = JSON.parse(fs.readFileSync(this.keysPath, "utf8"));
      if (Array.isArray(raw)) return raw;
      if (!raw.iv || !raw.data) return [];
      const decipher = crypto.createDecipheriv("aes-256-cbc", this.adminKey, Buffer.from(raw.iv, "hex"));
      const json = Buffer.concat([decipher.update(Buffer.from(raw.data, "hex")), decipher.final()]).toString("utf8");
      return JSON.parse(json);
    } catch {
      return [];
    }
  }

  _writeKeys(keys) {
    fs.mkdirSync(path.dirname(this.keysPath), { recursive: true });
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-cbc", this.adminKey, iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(keys, null, 2), "utf8"), cipher.final()]);
    fs.writeFileSync(this.keysPath, JSON.stringify({ iv: iv.toString("hex"), data: encrypted.toString("hex") }, null, 2), "utf8");
  }
}

module.exports = LicenseManager;

