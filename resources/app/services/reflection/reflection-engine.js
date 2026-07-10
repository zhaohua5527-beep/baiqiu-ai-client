const { FailureAnalyzer } = require("./failure-analyzer");
const { DecisionReviewer } = require("./decision-reviewer");
const { ReflectionMemory } = require("./reflection-memory");
const { MetaLearningCenter } = require("../meta-learning/meta-learning-center");

// Deprecated runtime implementation: kept as a reflection advisory adapter.
// Neural Core runtime uses services/neural-core/reflection-engine.js.

class ReflectionEngine {
  constructor({ failureAnalyzer = null, decisionReviewer = null, reflectionMemory = null, metaLearningCenter = null } = {}) {
    this.failureAnalyzer = failureAnalyzer || new FailureAnalyzer();
    this.decisionReviewer = decisionReviewer || new DecisionReviewer();
    this.reflectionMemory = reflectionMemory || new ReflectionMemory();
    this.metaLearningCenter = metaLearningCenter || new MetaLearningCenter();
  }

  reflect(input = {}) {
    const verification = input.verification || {};
    const status = input.status || (verification.status === "passed" ? "success" : "failed");
    const taskType = input.taskType || input.plan?.primaryIntent || input.plan?.tasks?.[0]?.intent || "";
    const failure = this.failureAnalyzer.analyze({
      ...input,
      status,
      reason: input.reason || verification.reason || input.error?.message || ""
    });
    const redundant = this.failureAnalyzer.detectRedundantSteps({
      ...(input.plan || {}),
      calculatorCreatorOpened: input.calculatorCreatorOpened
    });
    const recovery = this.failureAnalyzer.analyzeRecovery(input);
    const review = this.decisionReviewer.review(input.plan || {}, {
      reasoningResult: input.plan?.reasoningResult || input.reasoningResult
    });
    const improvements = [
      failure.suggestion,
      redundant.suggestion,
      recovery.suggestion,
      ...review.issues.map((issue) => this.issueSuggestion(issue))
    ].filter(Boolean);
    const reflection = status === "success"
      ? "\u4efb\u52a1\u6210\u529f\uff1a\u6267\u884c\u7ed3\u679c\u901a\u8fc7\u9a8c\u8bc1\uff0c\u5f53\u524d\u7b56\u7565\u53ef\u4fdd\u7559\u3002"
      : `\u4efb\u52a1\u5931\u8d25\uff1a${failure.reason}`;
    const result = {
      taskType,
      status,
      reflection,
      improvements,
      failure,
      redundant,
      recovery,
      decisionReview: review
    };
    const memory = this.reflectionMemory.record({
      taskType,
      status,
      mistake: status === "failed" ? failure.type : redundant.redundant ? "redundant_step" : "",
      reason: failure.reason,
      improvement: improvements[0] || "",
      confidence: Math.max(0.1, Math.min(1, Number(review.score || 0) / 100)),
      errorType: input.errorType || failure.type
    });
    result.memory = memory;
    if (status === "success" && verification.status === "passed") {
      result.metaLearning = this.metaLearningCenter.recordLearning({
        taskType,
        strategy: input.strategy || input.plan?.reasoningResult?.selectedPlan || { id: taskType || "success_strategy" },
        success: true,
        verified: true,
        verificationStatus: "passed",
        successRate: 1,
        avgDuration: input.duration || 0,
        recoveryCount: recovery.effective ? 1 : 0,
        errorType: input.errorType || ""
      });
    } else {
      result.metaLearning = null;
    }
    return result;
  }

  issueSuggestion(issue = {}) {
    if (issue.type === "duplicate_tool") return "\u68c0\u67e5\u5e76\u51cf\u5c11\u91cd\u590d\u5de5\u5177\u6b65\u9aa4";
    if (issue.type === "missing_dependency") return "\u4e3a\u5f15\u7528\u524d\u7f6e\u8f93\u51fa\u7684\u6b65\u9aa4\u8865\u5145dependsOn";
    if (issue.type === "missing_tool") return "\u89c4\u5212\u9636\u6bb5\u9700\u660e\u786e\u53ef\u6267\u884c\u5de5\u5177";
    if (issue.type === "low_success_strategy") return "\u4f18\u5148\u9009\u62e9\u5386\u53f2\u6210\u529f\u7387\u66f4\u9ad8\u7684\u65b9\u6848";
    return "";
  }
}

module.exports = { ReflectionEngine };
