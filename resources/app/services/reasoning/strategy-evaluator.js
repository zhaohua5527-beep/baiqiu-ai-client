function numberOr(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function riskPenalty(riskLevel = "low") {
  const risk = String(riskLevel || "low").toLowerCase();
  if (risk === "high") return 0.25;
  if (risk === "medium") return 0.1;
  return 0;
}

class StrategyEvaluator {
  evaluate(strategy = {}) {
    const successRate = Math.max(0, Math.min(1, numberOr(strategy.successRate, 0.5)));
    const stability = Math.max(0, Math.min(1, numberOr(strategy.toolStability, successRate)));
    const avgDuration = Math.max(0, numberOr(strategy.avgDuration, 0));
    const resourceCost = Math.max(0, numberOr(strategy.resourceCost, Array.isArray(strategy.tools) ? strategy.tools.length : 1));
    const durationPenalty = Math.min(0.12, avgDuration / 60000);
    const costPenalty = Math.min(0.08, resourceCost * 0.015);
    const risk = riskPenalty(strategy.riskLevel);
    const score = Math.max(0, Math.min(1, (successRate * 0.6) + (stability * 0.25) - risk - durationPenalty - costPenalty + 0.15));
    return {
      strategy,
      score: Number(score.toFixed(4)),
      reasons: {
        successRate,
        stability,
        riskPenalty: risk,
        durationPenalty,
        costPenalty
      }
    };
  }

  evaluateAll(strategies = []) {
    return strategies
      .map((strategy) => this.evaluate(strategy))
      .sort((a, b) => b.score - a.score);
  }
}

module.exports = { StrategyEvaluator };
