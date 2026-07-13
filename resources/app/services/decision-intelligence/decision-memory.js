const fs = require("node:fs");
const path = require("node:path");
const { dataRoot } = require("../data-root");

const DEFAULT_DECISION_ROOT = path.join(dataRoot(), "decision-intelligence");

function nowIso() {
  return new Date().toISOString();
}

class DecisionMemory {
  constructor({ rootDir = DEFAULT_DECISION_ROOT, maxItems = 300 } = {}) {
    this.rootDir = rootDir;
    this.filePath = path.join(rootDir, "decision-memory.json");
    this.maxItems = maxItems;
    this.ensureStore();
  }

  record(decision = {}) {
    const item = {
      decisionId: decision.decisionId || `decision-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      taskType: decision.taskType || "",
      input: String(decision.input || "").slice(0, 1000),
      selectedOption: decision.selectedOption || null,
      alternatives: Array.isArray(decision.alternatives) ? decision.alternatives : [],
      score: Number(decision.score || 0),
      reason: decision.reason || "",
      timestamp: decision.timestamp || nowIso(),
      safety: this.safety()
    };
    const data = this.load();
    data.decisions.push(item);
    this.writeJson(this.filePath, { decisions: data.decisions.slice(-this.maxItems) });
    return item;
  }

  query({ taskType = "", limit = 20 } = {}) {
    return this.load().decisions
      .filter((item) => !taskType || item.taskType === taskType)
      .slice(-Math.max(1, Number(limit) || 20));
  }

  load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      return { decisions: Array.isArray(parsed.decisions) ? parsed.decisions : [] };
    } catch {
      return { decisions: [] };
    }
  }

  safety() {
    return {
      decisionAnalysisOnly: true,
      executesTool: false,
      bypassesToolSelector: false,
      bypassesVerifierCenter: false
    };
  }

  ensureStore() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.filePath)) this.writeJson(this.filePath, { decisions: [] });
  }

  writeJson(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  }
}

module.exports = { DecisionMemory, DEFAULT_DECISION_ROOT };
