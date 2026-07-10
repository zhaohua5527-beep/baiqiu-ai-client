const fs = require("node:fs");
const path = require("node:path");

const ALLOWED_STATUS = new Set(["idle", "checking", "downloading", "verifying", "prepared", "switching", "testing", "completed", "rollback"]);
const LEGACY_STATUS = {
  ready: "prepared",
  applying: "switching",
  done: "completed",
  failed: "rollback"
};

class UpdateState {
  constructor(filePath) {
    this.filePath = filePath;
  }

  read() {
    try {
      const data = JSON.parse(fs.readFileSync(this.filePath, "utf8").replace(/^\uFEFF/, ""));
      return this.normalize(data);
    } catch {
      return this.normalize({});
    }
  }

  write(patch = {}) {
    const current = this.read();
    const next = this.normalize({ ...current, ...patch, lastUpdate: Date.now() });
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify({ ...next, state: next.status }, null, 2), "utf8");
    return next;
  }

  normalize(data = {}) {
    const rawStatus = typeof data.state === "string" ? data.state : (typeof data.status === "string" ? data.status : "idle");
    const status = ALLOWED_STATUS.has(rawStatus) ? rawStatus : (LEGACY_STATUS[rawStatus] || "idle");
    return {
      status,
      version: typeof data.version === "string" ? data.version : "",
      oldVersion: typeof data.oldVersion === "string" ? data.oldVersion : "",
      newVersion: typeof data.newVersion === "string" ? data.newVersion : (typeof data.version === "string" ? data.version : ""),
      sessionId: typeof data.sessionId === "string" ? data.sessionId : "",
      channel: typeof data.channel === "string" ? data.channel : "",
      lastUpdate: Number(data.lastUpdate || 0),
      time: Number(data.time || data.lastUpdate || 0),
      scriptPath: typeof data.scriptPath === "string" ? data.scriptPath : "",
      packagePath: typeof data.packagePath === "string" ? data.packagePath : "",
      backupPath: typeof data.backupPath === "string" ? data.backupPath : "",
      appPath: typeof data.appPath === "string" ? data.appPath : "",
      tempPath: typeof data.tempPath === "string" ? data.tempPath : "",
      error: typeof data.error === "string" ? data.error : ""
    };
  }
}

module.exports = { UpdateState, ALLOWED_STATUS, LEGACY_STATUS };
