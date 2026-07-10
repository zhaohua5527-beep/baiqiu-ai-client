const { Replanner } = require("./planning/replanner");
const { ExperienceCenter } = require("./experience/experience-center");
const { PerformanceTracker } = require("./optimization/performance-tracker");
const { AgentPolicyCenter } = require("./governance/agent-policy-center");
const { AgentBudgetManager } = require("./governance/agent-budget-manager");
const { AgentHealthMonitor } = require("./governance/agent-health-monitor");
const { getDefaultAgentStateManager } = require("./agent_state_manager");
const { getDefaultAgentEventBus, AGENT_EVENTS } = require("./neural-core/agent-event-bus");

class TaskOrchestrator {
  constructor({
    taskQueue,
    toolSelector,
    toolRegistry,
    toolExecutionService,
    replyBuilder = null,
    recordAgentState = null,
    sendSessionChanged = null,
    ensureRunActive = null,
    humanReadableError = null
    , agentGuard = null,
    replanner = null,
    experienceCenter = null,
    performanceTracker = null,
    policyCenter = null,
    budgetManager = null,
    healthMonitor = null,
    stateManager = null,
    eventBus = null
  } = {}) {
    this.taskQueue = taskQueue;
    this.toolSelector = toolSelector;
    this.toolRegistry = toolRegistry;
    this.toolExecutionService = toolExecutionService;
    this.replyBuilder = replyBuilder;
    this.recordAgentState = typeof recordAgentState === "function" ? recordAgentState : () => {};
    this.sendSessionChanged = typeof sendSessionChanged === "function" ? sendSessionChanged : () => {};
    this.ensureRunActive = typeof ensureRunActive === "function" ? ensureRunActive : () => {};
    this.humanReadableError = typeof humanReadableError === "function" ? humanReadableError : (error) => String(error || "任务失败");
    this.agentGuard = agentGuard;
    this.experienceCenter = experienceCenter || new ExperienceCenter();
    this.performanceTracker = performanceTracker || new PerformanceTracker();
    this.replanner = replanner || new Replanner({ experienceCenter: this.experienceCenter });
    this.policyCenter = policyCenter || new AgentPolicyCenter();
    this.budgetManager = budgetManager || new AgentBudgetManager({ policyCenter: this.policyCenter });
    this.healthMonitor = healthMonitor || new AgentHealthMonitor();
    this.stateManager = stateManager || getDefaultAgentStateManager();
    this.eventBus = eventBus || getDefaultAgentEventBus();
  }

  canExecute(planObject = {}) {
    return (planObject.tasks || []).some((task) => task.toolId && task.executable !== false);
  }

  async execute({ sessionId, message, planObject, contextPatch = {}, signal = null } = {}) {
    if (!this.canExecute(planObject)) return null;
    const executable = (planObject.tasks || []).filter((task) => task.toolId && task.executable !== false);
    const plan = executable.map((task) => task.title || task.name || task.toolId);
    const taskContext = this.stateManager.getTaskContext(sessionId, {
      taskId: planObject.id || "",
      userIntent: planObject.primaryIntent || "",
      goal: message,
      plan: planObject,
      taskContext: contextPatch.taskContext || {}
    });
    this.eventBus.publish(AGENT_EVENTS.PLAN_CREATED, {
      sessionId,
      traceId: contextPatch.traceId || "",
      intent: planObject.primaryIntent,
      goal: message,
      plan: planObject,
      currentAgent: "planner",
      taskContext
    });
    this.recordAgentState(sessionId, "planning", { intent: planObject.primaryIntent, plan });
    this.budgetManager.startSession(sessionId, planObject.id || "");
    for (const task of executable) {
      const policy = this.policyCenter.checkTask(task, { planTasks: executable });
      contextPatch.tracer?.recordGovernance?.(contextPatch.traceId, "policy_check", policy.status, { taskId: task.id, toolId: task.toolId, allowed: policy.allowed });
      if (policy.status === "policy_block" || policy.status === "budget_exceeded") {
        return this.buildBlockedResult({ sessionId, planObject, plan, status: policy.status, reason: policy.reason, traceId: contextPatch.traceId || "" });
      }
      const budget = this.budgetManager.consumeStep(sessionId, task.id || task.taskId || "");
      contextPatch.tracer?.recordGovernance?.(contextPatch.traceId, "budget_check", budget.status, { taskId: task.id, allowed: budget.allowed });
      if (!budget.allowed) return this.buildBlockedResult({ sessionId, planObject, plan, status: budget.status, reason: budget.reason, traceId: contextPatch.traceId || "" });
    }

    const queueResult = await this.taskQueue.executePlan({
      sessionId,
      plan: planObject,
      context: {
        ...contextPatch,
        sessionId,
        signal,
        taskContext,
        userMessage: message,
        provider: contextPatch.provider || "agent-os"
      },
      ensureActive: () => this.ensureRunActive(signal),
      selectTool: ({ intent, task, context }) => {
        this.eventBus.publish(AGENT_EVENTS.TOOL_SELECTED, {
          sessionId,
          traceId: context.traceId || "",
          intent,
          toolId: task.toolId || "",
          currentAgent: "tool_selector",
          taskId: task.id || task.taskId || "",
          taskContext
        });
        const selection = this.toolSelector.select({
          intent,
          task,
          context,
          availableTools: this.toolRegistry.list()
        });
        this.recordAgentState(sessionId, "tool_selected", {
          intent,
          logicalTool: task.toolId || selection.selectedTools?.[0]?.id || "",
          plan
        });
        return selection;
      },
      executeTool: ({ toolId, args, task, context }) => {
        const startedAt = Date.now();
        this.eventBus.publish(AGENT_EVENTS.TOOL_EXECUTING, {
          sessionId,
          traceId: context.traceId || "",
          intent: task.intent,
          logicalTool: toolId,
          toolId,
          currentAgent: "executor",
          taskId: task.id || task.taskId || "",
          taskContext
        });
        const budget = this.budgetManager.consumeToolCall(sessionId, task.id || task.taskId || "");
        context.tracer?.recordGovernance?.(context.traceId, "budget_check", budget.status, { toolId, allowed: budget.allowed });
        if (!budget.allowed) {
          this.healthMonitor.recordFailure("ExecutorAgent", Date.now() - startedAt);
          return {
            success: false,
            toolId,
            status: "failed",
            result: null,
            error: budget.reason,
            verification: { verified: false, status: "failed", checks: [{ name: "budget_check", passed: false, detail: budget }], reason: budget.reason },
            response: { success: false, result: null, error: budget.reason, verification: { verified: false, status: "failed", checks: [], reason: budget.reason } },
            governance: { budget }
          };
        }
        const guard = this.agentGuard?.beforeToolCall?.({ sessionId, toolId, args });
        if (guard && guard.allowed === false) {
          this.performanceTracker.record({
            toolId,
            taskType: task.intent || context.agentIntent || "",
            success: false,
            duration: Date.now() - startedAt
          });
          return {
            success: false,
            toolId,
            status: "failed",
            result: null,
            error: guard.reason,
            verification: { verified: false, status: "failed", checks: [{ name: "agent_guard", passed: false, detail: guard }], reason: guard.reason },
            response: { success: false, result: null, error: guard.reason, verification: { verified: false, status: "failed", checks: [], reason: guard.reason } },
            reliability: { guard }
          };
        }
        this.recordAgentState(sessionId, "executing", {
          intent: task.intent,
          logicalTool: toolId,
          toolId,
          plan
        });
        return this.toolExecutionService.execute({
          toolId,
          args,
          context: {
            ...context,
            agentIntent: task.intent,
            logicalTool: toolId,
            userMessage: context.taskMessage || message
          }
        }).then((execution) => {
          this.eventBus.publish(AGENT_EVENTS.TOOL_RESULT, {
            sessionId,
            traceId: context.traceId || "",
            taskId: task.id || task.taskId || "",
            toolId,
            success: Boolean(execution?.success),
            status: execution?.success ? "success" : "failed",
            error: execution?.error || execution?.response?.error || ""
          });
          this.eventBus.publish(AGENT_EVENTS.VERIFICATION_DONE, {
            sessionId,
            traceId: context.traceId || "",
            intent: task.intent,
            toolId,
            currentAgent: "verifier",
            taskContext
          });
          this.agentGuard?.afterExecution?.({ sessionId, success: execution?.success, error: execution?.error || execution?.response?.error || "" });
          this.healthMonitor[execution?.success ? "recordSuccess" : "recordFailure"]?.("VerifierAgent", Date.now() - startedAt);
          this.performanceTracker.record({
            toolId,
            taskType: task.intent || context.agentIntent || "",
            success: Boolean(execution?.success),
            duration: Date.now() - startedAt
          });
          return execution;
        }).catch((error) => {
          this.eventBus.publish(AGENT_EVENTS.TOOL_RESULT, {
            sessionId,
            traceId: context.traceId || "",
            taskId: task.id || task.taskId || "",
            toolId,
            success: false,
            status: "failed",
            error: error?.message || String(error)
          });
          this.healthMonitor.recordFailure("VerifierAgent", Date.now() - startedAt);
          this.performanceTracker.record({
            toolId,
            taskType: task.intent || context.agentIntent || "",
            success: false,
            duration: Date.now() - startedAt
          });
          throw error;
        });
      },
      replanner: this.replanner,
      onChange: () => this.sendSessionChanged()
    });
    this.eventBus.publish(AGENT_EVENTS.MEMORY_UPDATED, {
      sessionId,
      traceId: contextPatch.traceId || "",
      intent: planObject.primaryIntent,
      currentAgent: "learning",
      taskContext: queueResult.taskContext || taskContext
    });
    this.recordRecoveryExperiences(queueResult, sessionId);

    return this.buildAgentTaskResult({
      sessionId,
      message,
      planObject,
      plan,
      queueResult,
      traceId: contextPatch.traceId || ""
    });
  }

  recordRecoveryExperiences(queueResult = {}, sessionId = "") {
    if (!queueResult.success) return;
    const tasks = typeof this.taskQueue?.list === "function" ? this.taskQueue.list(sessionId) : (queueResult.tasks || []);
    for (const task of tasks || []) {
      const replan = task?.replan;
      if (!replan || replan.action === "abort") continue;
      const solution = replan.solution || {
        file_exists: "rename_file",
        missing_folder: "create_folder",
        browser_missing: "open_path",
        invalid_path: "use_workspace",
        recoverable: "retry"
      }[replan.rule] || "";
      this.experienceCenter.record({
        taskType: task.intent || "",
        toolId: task.toolId || "",
        errorType: replan.rule || "",
        failedReason: task.error || replan.reason || "",
        solution,
        success: true
      });
      this.performanceTracker.record({
        toolId: task.toolId || "",
        taskType: task.intent || "",
        success: true,
        duration: 0
      });
    }
  }

  buildBlockedResult({ sessionId, planObject, plan, status, reason, traceId = "" }) {
    this.recordAgentState(sessionId, status, { intent: planObject.primaryIntent, plan, reason });
    return {
      handled: true,
      intent: planObject.primaryIntent,
      logicalTool: "",
      toolId: "",
      plan,
      response: { success: false, error: reason },
      traceId,
      normalized: {
        success: false,
        result: null,
        error: reason,
        meta: { duration: 0, evidence: { success: false, status, error: reason, tasks: [], results: [] } }
      },
      text: `任务执行失败。\n\n原因：\n${reason}`
    };
  }

  buildAgentTaskResult({ sessionId, planObject, plan, queueResult, traceId = "" }) {
    const last = queueResult.results[queueResult.results.length - 1] || null;
    const builtReply = this.replyBuilder?.build({
      taskResult: { ...queueResult, queueResult },
      context: { userMessage: planObject.sourceText || "", traceId }
    }) || null;

    if (!queueResult.success) {
      const failedTitle = queueResult.failedTask?.title || "任务步骤";
      this.recordAgentState(sessionId, queueResult.status === "cancelled" ? "cancelled" : "failed", {
        intent: planObject.primaryIntent,
        logicalTool: last?.toolId || "",
        plan
      });
      return {
        handled: true,
        intent: planObject.primaryIntent,
        logicalTool: last?.toolId || "",
        toolId: last?.toolId || "",
        plan,
        response: last?.execution?.response || { success: false, error: queueResult.error },
        traceId,
        normalized: {
          success: false,
          result: null,
          error: queueResult.error,
          meta: { duration: 0, evidence: queueResult, taskContext: queueResult.taskContext || taskContext }
        },
        text: builtReply?.text || [
          "任务执行失败。",
          `步骤：${failedTitle}`,
          `原因：${this.humanReadableError(queueResult.error || "任务未通过验证")}`
        ].join("\n")
      };
    }

    this.recordAgentState(sessionId, "completed", {
      intent: planObject.primaryIntent,
      logicalTool: last?.toolId || "",
      plan
    });
    return {
      handled: true,
      intent: planObject.primaryIntent,
      logicalTool: last?.toolId || "",
      toolId: last?.toolId || "",
      plan,
      response: last?.execution?.response || { success: true },
      traceId,
      normalized: {
        success: true,
        result: queueResult.results.map((item) => item.result),
        error: null,
        meta: { duration: 0, evidence: queueResult, taskContext: queueResult.taskContext || taskContext }
      },
      text: builtReply?.text || [
        "任务分析：已按计划完成连续任务。",
        "执行状态：成功。",
        "检查结果：",
        ...queueResult.results.map((item) => `- ${item.task.title}：成功`),
        "验证结果：所有步骤已通过工具执行与验证。"
      ].join("\n")
    };
  }

  cancelSession(sessionId, reason = "user cancelled task") {
    return this.taskQueue.cancelSession(sessionId, reason);
  }
}

module.exports = { TaskOrchestrator };
