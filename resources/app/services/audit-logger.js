const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

class AuditLogger {
  constructor(options = {}) {
    this.logPath = options.logPath || path.join(os.homedir(), ".baiqiu", "logs", "audit.log");
    this.maxSize = options.maxSize || 10 * 1024 * 1024;
    this.maxFiles = options.maxFiles || 5;
    this.buffer = [];
    this.flushInterval = options.flushInterval || 5000;
    this.ensureLogDir();
    this._startFlushTimer();
  }

  ensureLogDir() {
    const dir = path.dirname(this.logPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  _rotateIfNeeded() {
    if (!fs.existsSync(this.logPath)) return;
    const stats = fs.statSync(this.logPath);
    if (stats.size < this.maxSize) return;
    for (let i = this.maxFiles - 1; i >= 1; i--) {
      const src = i === 1 ? this.logPath : `${this.logPath}.${i - 1}`;
      const dest = `${this.logPath}.${i}`;
      if (fs.existsSync(src)) fs.renameSync(src, dest);
    }
    fs.writeFileSync(this.logPath, "", "utf8");
  }

  _startFlushTimer() {
    this._timer = setInterval(() => this.flush(), this.flushInterval);
  }

  flush() {
    if (this.buffer.length === 0) return;
    this._rotateIfNeeded();
    const lines = this.buffer.join("\n") + "\n";
    this.buffer = [];
    try { fs.appendFileSync(this.logPath, lines, "utf8"); } catch (_) {}
  }

  _log(entry) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      ...entry
    };
    this.buffer.push(JSON.stringify(logEntry));
    if (this.buffer.length > 100) this.flush();
  }

  toolExecute(toolId, params, context, result, duration) {
    this._log({
      type: "TOOL_EXECUTE",
      toolId,
      params: this._sanitize(params),
      sessionId: context.sessionId,
      userId: context.userId,
      success: result.success,
      result: typeof result.result === "string" ? result.result.slice(0, 500) : result.result,
      error: result.error,
      duration,
      evidence: result.evidence
    });
  }

  permissionCheck(toolId, required, current, allowed, message) {
    this._log({
      type: "PERMISSION_CHECK",
      toolId,
      required,
      current,
      allowed,
      message: message || ""
    });
  }

  confirmation(toolId, confirmed, params) {
    this._log({
      type: "CONFIRMATION",
      toolId,
      confirmed,
      params: this._sanitize(params)
    });
  }

  error(toolId, error, context = {}) {
    this._log({
      type: "ERROR",
      toolId,
      error: {
        message: error.message || "Unknown error",
        code: error.code || "UNKNOWN"
      },
      sessionId: context.sessionId,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined
    });
  }

  _sanitize(obj) {
    if (!obj || typeof obj !== "object") return obj;
    const copy = { ...obj };
    const sensitive = ["password", "token", "apiKey", "secret", "key", "content"];
    for (const key of sensitive) {
      if (copy[key] !== undefined && typeof copy[key] === "string") {
        copy[key] = "***REDACTED***";
      }
    }
    return copy;
  }

  destroy() {
    clearInterval(this._timer);
    this.flush();
  }
}

module.exports = AuditLogger;
