const { Replanner } = require("../planning/replanner");
const { ExperienceCenter } = require("../experience/experience-center");

class FailureRecovery {
  constructor({ logger = null, experienceCenter = null } = {}) {
    this.logger = logger;
    this.experienceCenter = experienceCenter || new ExperienceCenter();
    this.replanner = new Replanner({ experienceCenter: this.experienceCenter });
  }

  replan(input = {}) {
    const decision = this.replanner.replan(input);
    this.logger?.log?.("recovery", "replan", decision);
    return decision;
  }

  plan({ result = {}, planObject = {} } = {}) {
    const error = String(result?.normalized?.error || result?.error || result?.response?.error || "");
    const failedTask = result?.normalized?.meta?.evidence?.failedTask || result?.failedTask || null;
    const toolId = result?.toolId || failedTask?.toolId || "";
    let action = "retry";
    let reason = "工具失败，执行一次受控重试。";
    if (/No tool selected|工具.*不匹配|ToolSelector|permission|权限/i.test(error)) {
      action = "replan";
      reason = "工具选择或权限失败，建议重新规划。";
    }
    if (/重复执行|已停止保护|loop|循环/i.test(error)) {
      action = "failed";
      reason = "触发循环保护，不再恢复。";
    }
    const recovery = {
      action,
      reason,
      toolId,
      planId: planObject?.id || "",
      timestamp: new Date().toISOString()
    };
    this.logger?.log?.("recovery", "plan", recovery);
    return recovery;
  }

  applyPlan(planObject = {}, recovery = {}) {
    if (!planObject || recovery.action === "failed") return planObject;
    if (recovery.action !== "replan") return planObject;
    return {
      ...planObject,
      id: `${planObject.id || "plan"}-recovery-${Date.now()}`,
      recovery,
      tasks: (planObject.tasks || []).map((task) => ({
        ...task,
        retryLimit: Math.max(Number(task.retryLimit || 0), 1),
        reason: [task.reason, recovery.reason].filter(Boolean).join("；")
      }))
    };
  }
}

module.exports = { FailureRecovery };
