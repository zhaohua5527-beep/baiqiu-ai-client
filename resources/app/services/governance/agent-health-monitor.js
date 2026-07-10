const fs = require("node:fs");
const path = require("node:path");
const { DEFAULT_GOVERNANCE_ROOT } = require("./agent-policy-center");

class AgentHealthMonitor {
  constructor({ rootDir = path.join(DEFAULT_GOVERNANCE_ROOT, "health") } = {}) {
    this.rootDir = rootDir;
    this.filePath = path.join(rootDir, "health.json");
    fs.mkdirSync(rootDir, { recursive: true });
    if (!fs.existsSync(this.filePath)) this.save({});
  }

  recordSuccess(agentName = "", duration = 0) {
    return this.record(agentName, true, duration);
  }

  recordFailure(agentName = "", duration = 0) {
    return this.record(agentName, false, duration);
  }

  record(agentName = "", success = true, duration = 0) {
    const name = String(agentName || "unknown");
    const data = this.load();
    const previous = data[name] || { agentName: name, successCount: 0, failCount: 0, avgDuration: 0, lastStatus: "unknown" };
    const count = Number(previous.successCount || 0) + Number(previous.failCount || 0);
    const nextCount = count + 1;
    const avgDuration = ((Number(previous.avgDuration || 0) * count) + Math.max(0, Number(duration || 0))) / nextCount;
    data[name] = {
      agentName: name,
      successCount: Number(previous.successCount || 0) + (success ? 1 : 0),
      failCount: Number(previous.failCount || 0) + (success ? 0 : 1),
      avgDuration,
      lastStatus: success ? "success" : "failed",
      updatedAt: new Date().toISOString()
    };
    this.save(data);
    return data[name];
  }

  getHealth(agentName = "") {
    const data = this.load();
    return agentName ? data[agentName] || null : data;
  }

  load() {
    try {
      return JSON.parse(fs.readFileSync(this.filePath, "utf8"));
    } catch {
      return {};
    }
  }

  save(data = {}) {
    fs.mkdirSync(this.rootDir, { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), "utf8");
  }
}

module.exports = { AgentHealthMonitor };
