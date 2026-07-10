const { PerformanceTracker } = require("../optimization/performance-tracker");
const { PermissionPolicy } = require("../permission/permission-policy");

class PlanEvaluator {
  constructor({ performanceTracker = null, permissionPolicy = null } = {}) {
    this.performanceTracker = performanceTracker || new PerformanceTracker();
    this.permissionPolicy = permissionPolicy || new PermissionPolicy();
  }

  evaluate(plan = {}, options = {}) {
    const steps = Array.isArray(plan.steps) ? plan.steps : [];
    const risk = this.evaluateRisk(steps);
    const successRate = this.estimateSuccessRate(steps, plan.taskType || "");
    const optimizedSteps = this.optimizeSteps(steps, options);
    const confidence = Math.max(0.1, Math.min(0.99, successRate - (risk.risk === "high" ? 0.15 : 0)));
    return {
      risk: risk.risk,
      needConfirm: risk.needConfirm,
      successRate,
      confidence,
      optimizedSteps,
      optimizations: optimizedSteps.length === steps.length ? [] : ["removed_redundant_open"]
    };
  }

  evaluateRisk(steps = []) {
    let risk = "low";
    let needConfirm = false;
    for (const step of steps) {
      const classified = this.permissionPolicy.classify({
        toolId: step.toolId || "",
        action: step.action || "",
        target: step.target || ""
      });
      if (classified.riskLevel === "high") risk = "high";
      else if (classified.riskLevel === "medium" && risk !== "high") risk = "medium";
      if (classified.needUserConfirm) needConfirm = true;
    }
    return { risk, needConfirm };
  }

  estimateSuccessRate(steps = [], taskType = "") {
    const rates = steps
      .map((step) => this.performanceTracker.get(step.toolId || "", taskType))
      .filter((item) => item && Number(item.sampleCount || 0) >= 1)
      .map((item) => Number(item.successRate || 0));
    if (!rates.length) return 0.9;
    return rates.reduce((sum, item) => sum + item, 0) / rates.length;
  }

  chooseBest(plans = []) {
    const evaluated = plans.map((plan) => ({ plan, evaluation: this.evaluate(plan) }))
      .sort((a, b) => Number(b.evaluation.successRate || 0) - Number(a.evaluation.successRate || 0));
    return evaluated[0] || null;
  }

  optimizeSteps(steps = [], options = {}) {
    if (!options.calculatorCreatorHandlesOpen) return steps;
    const hasCalculator = steps.some((step) => step.toolId === "calculator_creator");
    if (!hasCalculator) return steps;
    return steps.filter((step) => !(step.toolId === "browser_open" && step.target === "calculator"));
  }
}

module.exports = { PlanEvaluator };
