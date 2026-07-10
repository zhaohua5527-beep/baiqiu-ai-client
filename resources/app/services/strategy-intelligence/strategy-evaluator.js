const fs = require("node:fs");
const path = require("node:path");
const { DEFAULT_STRATEGY_ROOT } = require("./strategy-memory");

function nowIso() {
  return new Date().toISOString();
}

class StrategyEvaluator {
  constructor({ rootDir = DEFAULT_STRATEGY_ROOT } = {}) {
    this.rootDir = rootDir;
    this.filePath = path.join(rootDir, "strategy-evaluations.json");
    this.ensureStore();
  }

  evaluate(strategy = {}, context = {}) {
    const confidence = Number(strategy.confidence || 0.5);
    const decisionScore = Number(strategy.decisionScore || 0);
    const attentionScore = Number(strategy.attentionScore || 0);
    const reasoningScore = Number(strategy.reasoningScore || 0);
    const reflectionScore = Number(strategy.reflectionScore || 0);
    const evolutionScore = Number(strategy.evolutionScore || 0);
    const riskPenalty = strategy.riskLevel === "high" ? 0.28 : strategy.riskLevel === "medium" ? 0.12 : 0;
    const blockedPenalty = strategy.blocked ? 0.3 : 0;
    const score = Math.max(0, Math.min(1.5,
      confidence * 0.25
      + decisionScore * 0.25
      + attentionScore * 0.15
      + reasoningScore * 0.15
      + reflectionScore * 0.08
      + evolutionScore * 0.07
      + (strategy.sourceType === "goal" ? 0.05 : 0)
      - riskPenalty
      - blockedPenalty
    ));
    return {
      strategy,
      score: Number(score.toFixed(4)),
      reasons: {
        confidence,
        decisionScore,
        attentionScore,
        reasoningScore,
        reflectionScore,
        evolutionScore,
        riskPenalty,
        blockedPenalty,
        taskType: context.taskType || ""
      }
    };
  }

  evaluateAll(strategies = [], context = {}) {
    const evaluated = strategies
      .map((strategy) => this.evaluate(strategy, context))
      .sort((a, b) => b.score - a.score);
    this.writeJson(this.filePath, {
      evaluated: evaluated.slice(0, 50).map((item) => ({
        strategyId: item.strategy.strategyId,
        sourceType: item.strategy.sourceType,
        score: item.score
      })),
      updatedAt: nowIso(),
      safety: this.safety()
    });
    return evaluated;
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
    if (!fs.existsSync(this.filePath)) this.writeJson(this.filePath, { evaluated: [], safety: this.safety() });
  }

  writeJson(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  }
}

module.exports = { StrategyEvaluator };
