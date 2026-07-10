const { getDefaultAgentStateManager } = require("../agent_state_manager");
const { getDefaultAgentEventBus, AGENT_EVENTS } = require("../neural-core/agent-event-bus");

class VerifierAgent {
  constructor({ logger = null, tracer = null, stateManager = null, eventBus = null } = {}) {
    this.logger = logger;
    this.tracer = tracer;
    this.stateManager = stateManager || getDefaultAgentStateManager();
    this.eventBus = eventBus || getDefaultAgentEventBus();
  }

  review(execution = {}) {
    const sessionId = execution?.context?.sessionId || execution?.sessionId || execution?.traceId || "global";
    this.eventBus.publish(AGENT_EVENTS.VERIFICATION_DONE, {
      sessionId,
      traceId: execution?.traceId || execution?.context?.traceId || "",
      intent: execution?.intent || "",
      toolId: execution?.toolId || "",
      currentAgent: "verifier"
    });
    const normalized = execution?.normalized || {};
    const response = execution?.response || {};
    const verification = normalized?.meta?.verification || response?.verification || response?.meta?.verification || null;
    const success = Boolean(normalized.success ?? execution?.success);
    const status = success && (!verification || verification.status === "passed" || verification.status === "skipped")
      ? "success"
      : "failed";
    const result = {
      status,
      reason: status === "success" ? "" : (verification?.reason || normalized.error || response.error || "任务未通过验证"),
      verification,
      action: status === "success" ? "none" : this.actionFor(verification, normalized, execution),
      retry: false
    };
    result.retry = result.action === "retry";
    this.logger?.log?.("verifier", "review", {
      status: result.status,
      reason: result.reason,
      verificationStatus: verification?.status || ""
    });
    this.tracer?.record?.(execution?.traceId || execution?.context?.traceId || "", "VerifierAgent", "review", result.status, {
      reason: result.reason,
      verificationStatus: verification?.status || "",
      action: result.action
    });
    this.eventBus.publish(result.status === "success" ? AGENT_EVENTS.TASK_COMPLETED : AGENT_EVENTS.TASK_FAILED, {
      sessionId,
      traceId: execution?.traceId || execution?.context?.traceId || "",
      intent: execution?.intent || "",
      toolId: execution?.toolId || "",
      lastError: result.status === "success" ? "" : result.reason,
      currentAgent: "reply"
    });
    return result;
  }

  actionFor(verification, normalized, execution) {
    const reason = String(verification?.reason || normalized?.error || execution?.error || "");
    if (/重复执行|停止保护|循环保护/i.test(reason)) return "failed";
    if (/file_exists|文件不存在|not found|enoent/i.test(reason)) return "recover";
    if (/timeout|超时|network|fetch/i.test(reason)) return "retry";
    return "failed";
  }
}

module.exports = { VerifierAgent };
