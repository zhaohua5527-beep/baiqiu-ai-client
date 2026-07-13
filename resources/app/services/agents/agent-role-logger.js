const fs = require("node:fs");
const path = require("node:path");
const { dataRoot } = require("../data-root");

const DEFAULT_ROOT = path.join(dataRoot(), "logs", "agents");

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

class AgentRoleLogger {
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
    } catch {
      // Logging initialization is best effort.
    }
  }

  log(role, event, payload = {}) {
    try {
      fs.mkdirSync(this.root, { recursive: true });
      const file = path.join(this.root, `${role}.log`);
      fs.appendFileSync(file, `${new Date().toISOString()} ${event} ${safeJson(payload)}\n`, "utf8");
    } catch {
      // Role logs must never break task execution.
    }
  }

  paths() {
    return {
      root: this.root,
      supervisor: path.join(this.root, "supervisor.log"),
      planner: path.join(this.root, "planner.log"),
      executor: path.join(this.root, "executor.log"),
      verifier: path.join(this.root, "verifier.log")
    };
  }
}

module.exports = { AgentRoleLogger, DEFAULT_ROOT };
