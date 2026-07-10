const { MetaLearningCenter } = require("./meta-learning-center");

class PolicyOptimizer {
  constructor({ metaLearningCenter = null } = {}) {
    this.metaLearningCenter = metaLearningCenter || new MetaLearningCenter();
  }

  recordOutcome({ taskType = "", strategy = {}, success = false, errorType = "", reason = "" } = {}) {
    const normalizedError = String(errorType || "").toLowerCase();
    if (normalizedError === "fatal" || normalizedError === "permission" || normalizedError === "permission_denied") return null;
    return this.metaLearningCenter.adjustStrategy({
      taskType,
      strategy,
      delta: success ? 1 : -1,
      reason: reason || (success ? "strategy_success" : "strategy_failure")
    });
  }

  getRecommendation({ taskType = "" } = {}) {
    return this.metaLearningCenter.getHints({ taskType });
  }
}

module.exports = { PolicyOptimizer };
