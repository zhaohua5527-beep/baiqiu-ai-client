function lower(value = "") {
  return String(value || "").toLowerCase();
}

class FailureAnalyzer {
  analyze(input = {}) {
    const errorType = lower(input.errorType || input.error?.type || "");
    const reasonText = lower(input.reason || input.error?.message || input.failedReason || "");
    if (errorType === "invalid_path" || reasonText.includes("invalid_path") || reasonText.includes("path")) {
      return {
        type: "invalid_path",
        reason: "\u8def\u5f84\u7b56\u7565\u9519\u8bef",
        suggestion: "\u4f7f\u7528workspace\u5b89\u5168\u8def\u5f84",
        recoverable: true
      };
    }
    if (errorType === "permission" || errorType === "permission_denied" || reasonText.includes("permission")) {
      return {
        type: "permission_denied",
        reason: "\u6743\u9650\u88ab\u62d2\u7edd",
        suggestion: "\u4fdd\u6301\u7528\u6237\u6388\u6743\u6d41\u7a0b",
        recoverable: false,
        securitySensitive: true
      };
    }
    if (errorType === "fatal" || reasonText.includes("fatal")) {
      return {
        type: "fatal",
        reason: "\u4e0d\u53ef\u6062\u590d\u9519\u8bef",
        suggestion: "\u505c\u6b62\u4efb\u52a1\u5e76\u8fd4\u56de\u660e\u786e\u5931\u8d25\u539f\u56e0",
        recoverable: false,
        fatal: true
      };
    }
    return {
      type: errorType || "unknown",
      reason: input.status === "success" ? "\u4efb\u52a1\u5df2\u6210\u529f" : "\u4efb\u52a1\u5931\u8d25\u539f\u56e0\u9700\u8fdb\u4e00\u6b65\u786e\u8ba4",
      suggestion: input.status === "success" ? "\u4fdd\u7559\u5f53\u524d\u7b56\u7565" : "\u68c0\u67e5\u6267\u884c\u7ed3\u679c\u548c\u9a8c\u8bc1\u7ed3\u679c",
      recoverable: input.status !== "success"
    };
  }

  detectRedundantSteps(plan = {}) {
    const steps = Array.isArray(plan.steps) ? plan.steps : Array.isArray(plan.tasks) ? plan.tasks : [];
    const toolIds = steps.map((step) => step.toolId).filter(Boolean);
    const hasCalculator = toolIds.includes("calculator_creator");
    const hasOpen = toolIds.includes("browser_open") || toolIds.includes("open_path");
    if (hasCalculator && hasOpen && plan.calculatorCreatorOpened === true) {
      return {
        redundant: true,
        reason: "\u8ba1\u7b97\u5668\u5de5\u5177\u5df2\u5b8c\u6210\u6253\u5f00",
        suggestion: "\u51cf\u5c11browser_open\u6b65\u9aa4"
      };
    }
    return { redundant: false, reason: "", suggestion: "" };
  }

  analyzeRecovery(input = {}) {
    const recoveries = Array.isArray(input.recoveries) ? input.recoveries : [];
    const successful = recoveries.find((item) => item.success === true);
    if (successful) {
      return {
        action: successful.action || "recover",
        effective: true,
        suggestion: `\u4fdd\u7559${successful.action || "recover"}\u6062\u590d\u7b56\u7565`
      };
    }
    const failed = recoveries.find((item) => item.success === false);
    if (failed) {
      return {
        action: failed.action || "abort",
        effective: false,
        suggestion: "\u6062\u590d\u5931\u8d25\u65f6\u5e94\u66f4\u65e9\u7ec8\u6b62\u6216\u91cd\u65b0\u89c4\u5212"
      };
    }
    return { action: "", effective: false, suggestion: "" };
  }
}

module.exports = { FailureAnalyzer };
