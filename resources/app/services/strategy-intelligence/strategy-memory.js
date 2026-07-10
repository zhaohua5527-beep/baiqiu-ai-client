const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_STRATEGY_ROOT = path.join("D:\\BaiQiuAI", "data", "strategy-intelligence");

function nowIso() {
  return new Date().toISOString();
}

class StrategyMemory {
  constructor({ rootDir = DEFAULT_STRATEGY_ROOT, maxItems = 300 } = {}) {
    this.rootDir = rootDir;
    this.filePath = path.join(rootDir, "strategy-memory.json");
    this.maxItems = maxItems;
    this.ensureStore();
  }

  record(input = {}) {
    const item = {
      strategyId: input.strategyId || `strategy-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      taskType: input.taskType || "",
      input: String(input.input || "").slice(0, 1000),
      selectedStrategy: input.selectedStrategy || null,
      alternatives: Array.isArray(input.alternatives) ? input.alternatives : [],
      score: Number(input.score || 0),
      reason: input.reason || "",
      timestamp: input.timestamp || nowIso(),
      safety: this.safety()
    };
    const data = this.load();
    data.strategies.push(item);
    this.writeJson(this.filePath, { strategies: data.strategies.slice(-this.maxItems) });
    return item;
  }

  query({ taskType = "", limit = 20 } = {}) {
    return this.load().strategies
      .filter((item) => !taskType || item.taskType === taskType)
      .slice(-Math.max(1, Number(limit) || 20));
  }

  load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      return { strategies: Array.isArray(parsed.strategies) ? parsed.strategies : [] };
    } catch {
      return { strategies: [] };
    }
  }

  safety() {
    return {
      strategyAnalysisOnly: true,
      executesTool: false,
      bypassesToolSelector: false,
      bypassesVerifierCenter: false
    };
  }

  ensureStore() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.filePath)) this.writeJson(this.filePath, { strategies: [] });
  }

  writeJson(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  }
}

module.exports = { StrategyMemory, DEFAULT_STRATEGY_ROOT };
