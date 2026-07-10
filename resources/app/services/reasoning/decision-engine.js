const { StrategyEvaluator } = require("./strategy-evaluator");

// Deprecated runtime implementation: kept for reasoning compatibility only.
// Neural Core runtime uses services/neural-core/decision-engine.js.

class DecisionEngine {
  constructor({ strategyEvaluator = null } = {}) {
    this.strategyEvaluator = strategyEvaluator || new StrategyEvaluator();
  }

  decide({ candidatePlans = [] } = {}) {
    const evaluated = this.strategyEvaluator.evaluateAll(candidatePlans);
    const selected = evaluated[0] || null;
    return {
      selectedStrategy: selected?.strategy || null,
      score: selected ? selected.score : 0,
      alternatives: evaluated.slice(1).map((item) => ({
        strategy: item.strategy,
        score: item.score,
        reasons: item.reasons
      })),
      evaluated
    };
  }
}

module.exports = { DecisionEngine };
