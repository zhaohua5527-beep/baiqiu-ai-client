const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_ROOT = path.join("D:\\BaiQiuAI", "data", "logs", "reliability");

function safeJson(value) {
  try {
    return JSON.stringify(value, (key, item) => {
      if (/apiKey|authorization|token|secret|password/i.test(String(key || ""))) return "***";
      if (typeof item === "string" && item.length > 2000) return `${item.slice(0, 2000)}...`;
      return item;
    });
  } catch {
    return String(value || "");
  }
}

class ReliabilityLogger {
  constructor({ root = DEFAULT_ROOT } = {}) {
    this.root = root;
    this.ensureFiles();
  }

  ensureFiles() {
    try {
      fs.mkdirSync(this.root, { recursive: true });
      for (const file of Object.values(this.paths()).filter((item) => item.endsWith(".log"))) {
        if (!fs.existsSync(file)) fs.writeFileSync(file, "", "utf8");
      }
    } catch {}
  }

  log(channel, event, payload = {}) {
    try {
      fs.mkdirSync(this.root, { recursive: true });
      fs.appendFileSync(path.join(this.root, `${channel}.log`), `${new Date().toISOString()} ${event} ${safeJson(payload)}\n`, "utf8");
    } catch {}
  }

  paths() {
    return {
      root: this.root,
      guard: path.join(this.root, "guard.log"),
      retry: path.join(this.root, "retry.log"),
      recovery: path.join(this.root, "recovery.log")
    };
  }
}

module.exports = { ReliabilityLogger, DEFAULT_ROOT };
