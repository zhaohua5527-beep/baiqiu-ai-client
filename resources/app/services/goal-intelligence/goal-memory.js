const fs = require("node:fs");
const path = require("node:path");
const { dataRoot } = require("../data-root");

const DEFAULT_GOAL_INTELLIGENCE_ROOT = path.join(dataRoot(), "goal-intelligence");

function nowIso() {
  return new Date().toISOString();
}

class GoalMemory {
  constructor({ rootDir = DEFAULT_GOAL_INTELLIGENCE_ROOT, maxItems = 300 } = {}) {
    this.rootDir = rootDir;
    this.filePath = path.join(rootDir, "goal-memory.json");
    this.maxItems = maxItems;
    this.ensureStore();
  }

  record(input = {}) {
    const item = {
      goalIntelligenceId: input.goalIntelligenceId || `goal-intel-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      taskType: input.taskType || "",
      input: String(input.input || "").slice(0, 1000),
      pursuit: input.pursuit || null,
      adaptation: input.adaptation || null,
      conflicts: Array.isArray(input.conflicts) ? input.conflicts : [],
      recommendation: input.recommendation || "",
      score: Number(input.score || 0),
      timestamp: input.timestamp || nowIso(),
      safety: this.safety()
    };
    const data = this.load();
    data.items.push(item);
    this.writeJson(this.filePath, { items: data.items.slice(-this.maxItems) });
    return item;
  }

  query({ taskType = "", limit = 20 } = {}) {
    return this.load().items
      .filter((item) => !taskType || item.taskType === taskType)
      .slice(-Math.max(1, Number(limit) || 20));
  }

  load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      return { items: Array.isArray(parsed.items) ? parsed.items : [] };
    } catch {
      return { items: [] };
    }
  }

  safety() {
    return {
      goalIntelligenceOnly: true,
      executesTool: false,
      bypassesToolSelector: false,
      bypassesVerifierCenter: false
    };
  }

  ensureStore() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.filePath)) this.writeJson(this.filePath, { items: [] });
  }

  writeJson(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  }
}

module.exports = { GoalMemory, DEFAULT_GOAL_INTELLIGENCE_ROOT };
