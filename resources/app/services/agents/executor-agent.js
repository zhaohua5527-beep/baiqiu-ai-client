const { AgentHealthMonitor } = require("../governance/agent-health-monitor");
const { getDefaultAgentStateManager } = require("../agent_state_manager");
const { getDefaultAgentEventBus, AGENT_EVENTS } = require("../neural-core/agent-event-bus");
const { AgentManager } = require("../neural-core/agent-manager");

class ExecutorAgent {
  constructor({ taskOrchestrator = null, logger = null, retryManager = null, failureRecovery = null, tracer = null, healthMonitor = null, stateManager = null, eventBus = null, agentManager = null } = {}) {
    this.taskOrchestrator = taskOrchestrator;
    this.logger = logger;
    this.retryManager = retryManager;
    this.failureRecovery = failureRecovery;
    this.tracer = tracer;
    this.healthMonitor = healthMonitor || new AgentHealthMonitor();
    this.stateManager = stateManager || getDefaultAgentStateManager();
    this.eventBus = eventBus || getDefaultAgentEventBus();
    this.agentManager = agentManager || new AgentManager({ eventBus: this.eventBus });
  }

  async execute({ sessionId = "", message = "", planObject = null, contextPatch = {}, signal = null } = {}) {
    if (!planObject) return null;
    const traceId = contextPatch.traceId || "";
    this.eventBus.publish(AGENT_EVENTS.TOOL_EXECUTING, {
      sessionId: sessionId || traceId || "global",
      traceId,
      intent: planObject.primaryIntent || "",
      goal: message,
      plan: planObject,
      currentAgent: "executor",
      taskContext: contextPatch.taskContext
    });
    this.logger?.log?.("executor", "start", {
      sessionId,
      primaryIntent: planObject.primaryIntent,
      tasks: (planObject.tasks || []).map((task) => ({ id: task.id, toolId: task.toolId, executable: task.executable !== false }))
    });
    this.tracer?.record?.(traceId, "ExecutorAgent", "start", "running", {
      sessionId,
      primaryIntent: planObject.primaryIntent,
      tasks: (planObject.tasks || []).map((task) => ({ id: task.id, toolId: task.toolId, executable: task.executable !== false }))
    });
    const operation = async ({ previous } = {}) => {
      const recovery = previous && !this.isSuccess(previous)
        ? this.failureRecovery?.plan?.({ result: previous, planObject })
        : null;
      const nextPlan = recovery ? this.failureRecovery?.applyPlan?.(planObject, recovery) || planObject : planObject;
      return this.agentManager.dispatchTask({
        taskOrchestrator: this.taskOrchestrator,
        sessionId,
        message,
        planObject: nextPlan,
        contextPatch: {
          ...contextPatch,
          recoveryAction: recovery?.action || "",
          previousError: previous?.normalized?.error || previous?.error || ""
        },
        signal
      });
    };
    const startedAt = Date.now();
    const result = this.retryManager
      ? await this.retryManager.run(operation, {
        sessionId,
        traceId,
        recover: ({ result: failed }) => this.failureRecovery?.plan?.({ result: failed, planObject }),
        shouldRetry: (failed, attempt) => !/重复执行|停止保护|循环保护/i.test(String(failed?.normalized?.error || failed?.error || "")) && attempt < 3
      })
      : await operation();
    this.logger?.log?.("executor", "end", {
      sessionId,
      handled: Boolean(result?.handled),
      success: Boolean(result?.normalized?.success),
      toolId: result?.toolId || "",
      retryCount: result?.reliability?.retryCount || 0
    });
    this.eventBus.publish(this.isSuccess(result) ? AGENT_EVENTS.VERIFICATION_DONE : AGENT_EVENTS.TASK_FAILED, {
      sessionId: sessionId || traceId || "global",
      traceId,
      intent: planObject.primaryIntent || "",
      toolId: result?.toolId || "",
      lastError: this.isSuccess(result) ? "" : (result?.normalized?.error || result?.error || ""),
      currentAgent: this.isSuccess(result) ? "verifier" : "reply"
    });
    this.tracer?.record?.(traceId, "ExecutorAgent", "end", this.isSuccess(result) ? "success" : "failed", {
      sessionId,
      handled: Boolean(result?.handled),
      toolId: result?.toolId || "",
      retryCount: result?.reliability?.retryCount || 0,
      error: result?.normalized?.error || result?.error || ""
    });
    this.healthMonitor[this.isSuccess(result) ? "recordSuccess" : "recordFailure"]?.("ExecutorAgent", Date.now() - startedAt);
    this.tracer?.recordGovernance?.(traceId, "health_record", this.isSuccess(result) ? "success" : "failed", {
      agentName: "ExecutorAgent"
    });
    return result;
  }

  isSuccess(result) {
    return Boolean(result?.normalized?.success ?? result?.success);
  }
}

module.exports = { ExecutorAgent };
