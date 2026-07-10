const fs = require("node:fs");
const path = require("node:path");
const { DEFAULT_DECISION_ROOT } = require("./decision-memory");

function nowIso() {
  return new Date().toISOString();
}

class DecisionEvaluator {
  constructor({ rootDir = DEFAULT_DECISION_ROOT } = {}) {
    this.rootDir = rootDir;
    this.filePath = path.join(rootDir, "decision-evaluations.json");
    this.ensureStore();
  }

  evaluate(option = {}, context = {}) {
    const confidence = Number(option.confidence || 0.5);
    const attention = Number(option.attentionScore || 0);
    const reasoning = Number(option.reasoningScore || 0);
    const riskPenalty = option.riskLevel === "high" ? 0.25 : option.riskLevel === "medium" ? 0.1 : 0;
    const blockedPenalty = option.blocked ? 0.35 : 0;
    const goalBoost = option.sourceType === "goal" ? 0.08 : 0;
    const reflectionBoost = option.sourceType === "reflection" ? 0.05 : 0;
    const evolutionBoost = option.sourceType === "evolution" ? 0.04 : 0;
    const score = Math.max(0, confidence * 0.45 + attention * 0.25 + reasoning * 0.2 + goalBoost + reflectionBoost + evolutionBoost - riskPenalty - blockedPenalty);
    return {
      option,
      score: Number(Math.min(score, 1.5).toFixed(4)),
      reasons: {
        confidence,
        attention,
        reasoning,
        riskPenalty,
        blockedPenalty,
        goalBoost,
        reflectionBoost,
        evolutionBoost,
        taskType: context.taskType || ""
      }
    };
  }

  evaluateAll(options = [], context = {}) {
    const evaluated = options
      .map((option) => this.evaluate(option, context))
      .sort((a, b) => b.score - a.score);
    this.writeJson(this.filePath, {
      evaluated: evaluated.slice(0, 50).map((item) => ({
        optionId: item.option.optionId,
        sourceType: item.option.sourceType,
        score: item.score
      })),
      updatedAt: nowIso(),
      safety: this.safety()
    });
    return evaluated;
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
    if (!fs.existsSync(this.filePath)) this.writeJson(this.filePath, { evaluated: [], updatedAt: null, safety: this.safety() });
  }

  writeJson(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  }
}

module.exports = { DecisionEvaluator };
