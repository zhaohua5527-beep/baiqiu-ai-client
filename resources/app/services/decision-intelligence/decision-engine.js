const fs = require("node:fs");
const path = require("node:path");
const { DecisionEvaluator } = require("./decision-evaluator");
const { DEFAULT_DECISION_ROOT } = require("./decision-memory");

function nowIso() {
  return new Date().toISOString();
}

// Deprecated runtime implementation: kept as an advisory compatibility adapter.
// Neural Core runtime uses services/neural-core/decision-engine.js.

class DecisionEngine {
  constructor({ rootDir = DEFAULT_DECISION_ROOT, evaluator = null } = {}) {
    this.rootDir = rootDir;
    this.filePath = path.join(rootDir, "decision-engine.json");
    this.evaluator = evaluator || new DecisionEvaluator({ rootDir });
    this.ensureStore();
  }

  decide({ options = [], context = {} } = {}) {
    const evaluated = this.evaluator.evaluateAll(options, context);
    const selected = evaluated[0] || null;
    const result = {
      decisionId: `decision-analysis-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      taskType: context.taskType || "",
      selectedOption: selected?.option || null,
      score: selected?.score || 0,
      alternatives: evaluated.slice(1).map((item) => ({
        option: item.option,
        score: item.score,
        reasons: item.reasons
      })),
      evaluated,
      reason: selected ? `selected ${selected.option.sourceType}:${selected.option.action} with score ${selected.score}` : "no option available",
      timestamp: nowIso(),
      safety: this.safety()
    };
    this.writeJson(this.filePath, {
      decisionId: result.decisionId,
      selectedOptionId: result.selectedOption?.optionId || "",
      score: result.score,
      reason: result.reason,
      updatedAt: result.timestamp,
      safety: result.safety
    });
    return result;
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
    if (!fs.existsSync(this.filePath)) this.writeJson(this.filePath, { selectedOptionId: "", score: 0, safety: this.safety() });
  }

  writeJson(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  }
}

module.exports = { DecisionEngine };
