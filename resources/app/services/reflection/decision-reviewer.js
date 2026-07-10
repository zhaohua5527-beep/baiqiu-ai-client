class DecisionReviewer {
  review(plan = {}, context = {}) {
    const steps = Array.isArray(plan.steps) ? plan.steps : Array.isArray(plan.tasks) ? plan.tasks : [];
    const issues = [];
    const seen = new Map();
    for (const step of steps) {
      if (!step || typeof step !== "object") {
        issues.push({ type: "invalid_step", message: "\u65e0\u6548\u6b65\u9aa4" });
        continue;
      }
      if (step.type !== "clarification" && step.executable !== false && !step.toolId && step.action !== "clarify") {
        issues.push({ type: "missing_tool", stepId: step.id || step.taskId || "" });
      }
      const key = [step.toolId || "", JSON.stringify(step.args || {})].join("|");
      if (step.toolId && seen.has(key)) {
        issues.push({ type: "duplicate_tool", stepId: step.id || step.taskId || "", previous: seen.get(key) });
      } else if (step.toolId) {
        seen.set(key, step.id || step.taskId || "");
      }
      const dependsOn = Array.isArray(step.dependsOn) ? step.dependsOn : [];
      if ((step.args && JSON.stringify(step.args).includes("{{step")) && !dependsOn.length) {
        issues.push({ type: "missing_dependency", stepId: step.id || step.taskId || "" });
      }
    }
    const selected = context.reasoningResult?.selectedPlan;
    const alternatives = context.reasoningResult?.decision?.alternatives || [];
    if (selected && alternatives.some((item) => Number(item.score || 0) > Number(context.reasoningResult.confidence || 0))) {
      issues.push({ type: "low_success_strategy", message: "\u5b58\u5728\u66f4\u9ad8\u5206\u5019\u9009\u65b9\u6848" });
    }
    const score = Math.max(0, 100 - (issues.length * 10));
    return { score, issues };
  }
}

module.exports = { DecisionReviewer };
