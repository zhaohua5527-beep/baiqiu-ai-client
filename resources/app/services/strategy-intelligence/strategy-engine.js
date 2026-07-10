const fs = require("node:fs");
const path = require("node:path");
const { StrategyEvaluator } = require("./strategy-evaluator");
const { DEFAULT_STRATEGY_ROOT } = require("./strategy-memory");

function nowIso() {
  return new Date().toISOString();
}

// Deprecated runtime implementation: kept for strategy-intelligence compatibility.
// Neural Core runtime uses services/neural-core/strategy-engine.js.

class StrategyEngine {
  constructor({ rootDir = DEFAULT_STRATEGY_ROOT, evaluator = null } = {}) {
    this.rootDir = rootDir;
    this.filePath = path.join(rootDir, "strategy-engine.json");
    this.evaluator = evaluator || new StrategyEvaluator({ rootDir });
    this.ensureStore();
  }

  select({ strategies = [], context = {} } = {}) {
    const evaluated = this.evaluator.evaluateAll(strategies, context);
    const selected = evaluated[0] || null;
    const result = {
      strategyAnalysisId: `strategy-analysis-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      taskType: context.taskType || "",
      selectedStrategy: selected?.strategy || null,
      score: selected?.score || 0,
      alternatives: evaluated.slice(1).map((item) => ({
        strategy: item.strategy,
        score: item.score,
        reasons: item.reasons
      })),
      evaluated,
      reason: selected ? `selected ${selected.strategy.sourceType}:${selected.strategy.strategy} with score ${selected.score}` : "no strategy available",
      timestamp: nowIso(),
      safety: this.safety()
    };
    this.writeJson(this.filePath, {
      strategyAnalysisId: result.strategyAnalysisId,
      selectedStrategyId: result.selectedStrategy?.strategyId || "",
      score: result.score,
      reason: result.reason,
      updatedAt: result.timestamp,
      safety: result.safety
    });
    return result;
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
    if (!fs.existsSync(this.filePath)) this.writeJson(this.filePath, { selectedStrategyId: "", score: 0, safety: this.safety() });
  }

  writeJson(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  }
}

module.exports = { StrategyEngine };
