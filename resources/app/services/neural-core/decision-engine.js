const fs = require("node:fs");
const path = require("node:path");
const { dataRoot } = require("../data-root");

const DEFAULT_DECISION_FILE = path.join(dataRoot(), "memory", "decisions.json");

function nowIso() {
  return new Date().toISOString();
}

function metric(name, data) {
  try { require("./agent-event-bus").recordRuntimeMetric?.(name, data); } catch {}
}

function errorCode() {
  try { return require("./agent-event-bus").ERROR_CODES.DECISION_FAILURE; } catch { return "NC1002"; }
}

class DecisionEngine {
  constructor({ filePath = DEFAULT_DECISION_FILE, maxItems = 500 } = {}) {
    this.filePath = filePath;
    this.maxItems = maxItems;
    this.ensureStore();
  }

  decide({ taskType = "", strategy = null, experiences = [], riskLevel = "low", goal = "" } = {}) {
    const startedAt = Date.now();
    try {
      const item = {
        decisionId: `decision-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        taskType,
        decision: strategy?.mode || "default_verified",
        strategyId: strategy?.strategyId || "",
        reason: strategy?.reason || "use default verified planning path",
        usedExperience: Array.isArray(experiences) ? experiences.slice(0, 5) : [],
        riskLevel,
        confidence: Number.isFinite(Number(strategy?.confidence)) ? Number(strategy.confidence) : 0.5,
        goal,
        createdAt: nowIso()
      };
      const data = this.load();
      data.items.push(item);
      this.write({ items: data.items.slice(-this.maxItems) });
      metric("DecisionEngine", { duration: Date.now() - startedAt, success: true });
      return item;
    } catch (error) {
      metric("DecisionEngine", { duration: Date.now() - startedAt, success: false });
      return {
        decisionId: `decision-recovered-${Date.now()}`,
        taskType,
        decision: "default_verified",
        strategyId: strategy?.strategyId || "",
        reason: `${errorCode()} Decision Failure: ${error?.message || error}`,
        usedExperience: [],
        riskLevel,
        confidence: 0.3,
        goal,
        createdAt: nowIso(),
        errorCode: errorCode(),
        recovered: true
      };
    }
  }

  recent(limit = 10) {
    return this.load().items.slice(-Math.max(1, Number(limit) || 10)).reverse();
  }

  load() {
    this.ensureStore();
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      return { items: Array.isArray(parsed.items) ? parsed.items : [] };
    } catch (error) {
      this.repairStore(error);
      return { items: [] };
    }
  }

  ensureStore() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    if (!fs.existsSync(this.filePath)) this.write({ items: [] });
  }

  write(data = {}) {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), "utf8");
  }

  repairStore(error = null) {
    try {
      if (fs.existsSync(this.filePath)) fs.copyFileSync(this.filePath, `${this.filePath}.corrupt-${Date.now()}`);
      this.write({ items: [] });
      metric("DecisionEngine.repair", { duration: 0, success: true });
      try {
        require("./agent-event-bus").writeDiagnostics?.({
          error: require("./agent-event-bus").normalizeError?.(error, "NC6001", "decision_memory")
        });
      } catch {}
    } catch {
      metric("DecisionEngine.repair", { duration: 0, success: false });
    }
  }
}

module.exports = { DecisionEngine, DEFAULT_DECISION_FILE };
