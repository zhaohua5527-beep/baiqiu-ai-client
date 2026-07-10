const fs = require("node:fs");
const path = require("node:path");
const { DEFAULT_IDENTITY_ROOT } = require("./agent-profile-manager");

function nowIso() {
  return new Date().toISOString();
}

class AgentLifecycleManager {
  constructor({ rootDir = DEFAULT_IDENTITY_ROOT } = {}) {
    this.rootDir = rootDir;
    this.filePath = path.join(rootDir, "lifecycle.json");
    this.ensureStore();
  }

  transition(agentId = "", status = "active", detail = {}) {
    const id = agentId || "default-agent";
    const data = this.load();
    const previous = data.agents[id] || { agentId: id, history: [] };
    const event = {
      status,
      detail,
      timestamp: nowIso()
    };
    const next = {
      ...previous,
      agentId: id,
      status,
      lastDetail: detail,
      updatedAt: event.timestamp,
      history: [...(previous.history || []), event].slice(-200)
    };
    data.agents[id] = next;
    this.save(data);
    return next;
  }

  getState(agentId = "") {
    return this.load().agents[agentId] || null;
  }

  listStates() {
    return Object.values(this.load().agents);
  }

  ensureStore() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.filePath)) this.save({ agents: {} });
  }

  load() {
    this.ensureStore();
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      return { agents: parsed.agents && typeof parsed.agents === "object" ? parsed.agents : {} };
    } catch {
      return { agents: {} };
    }
  }

  save(data = {}) {
    fs.mkdirSync(this.rootDir, { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify({ agents: data.agents || {} }, null, 2), "utf8");
  }
}

module.exports = { AgentLifecycleManager };
