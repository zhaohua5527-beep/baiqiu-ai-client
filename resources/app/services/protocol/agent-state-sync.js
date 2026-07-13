const fs = require("node:fs");
const path = require("node:path");
const { dataRoot } = require("../data-root");
const { ProtocolValidator } = require("./protocol-validator");

const DEFAULT_PROTOCOL_ROOT = path.join(dataRoot(), "protocol");

function nowIso() {
  return new Date().toISOString();
}

class AgentStateSync {
  constructor({ rootDir = DEFAULT_PROTOCOL_ROOT, validator = null } = {}) {
    this.rootDir = rootDir;
    this.filePath = path.join(rootDir, "agent-state.json");
    this.validator = validator || new ProtocolValidator();
    this.ensureStore();
  }

  update(agent = "", patch = {}) {
    const state = {
      agent,
      status: patch.status || "idle",
      currentTask: patch.currentTask || "",
      currentStage: patch.currentStage || "",
      traceId: patch.traceId || "",
      sessionId: patch.sessionId || "",
      updatedAt: patch.updatedAt || nowIso()
    };
    const validation = this.validator.validateState(state);
    if (!validation.valid) return { success: false, state, validation };
    const data = this.load();
    data.states[agent] = state;
    this.save(data);
    return { success: true, state, validation };
  }

  get(agent = "") {
    const data = this.load();
    return agent ? data.states[agent] || null : data.states;
  }

  ensureStore() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.filePath)) this.save({ states: {} });
  }

  load() {
    this.ensureStore();
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      return { states: parsed.states && typeof parsed.states === "object" ? parsed.states : {} };
    } catch {
      return { states: {} };
    }
  }

  save(data = {}) {
    fs.mkdirSync(this.rootDir, { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify({ states: data.states || {} }, null, 2), "utf8");
  }
}

module.exports = { AgentStateSync, DEFAULT_PROTOCOL_ROOT };
