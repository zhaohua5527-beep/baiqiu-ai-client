const { createAgentContext } = require("../core/agent-context");
const { createAgentResult, normalizeAgentStatus } = require("../core/agent-result");
const { getDefaultAgentStateManager } = require("./agent_state_manager");
const { getDefaultAgentEventBus, AGENT_EVENTS } = require("./neural-core/agent-event-bus");

class AgentController {
  constructor({ logger = null, tracer = null, stateManager = null, eventBus = null } = {}) {
    this.logger = typeof logger === "function" ? logger : null;
    this.tracer = tracer;
    this.stateManager = stateManager || getDefaultAgentStateManager();
    this.eventBus = eventBus || getDefaultAgentEventBus();
  }

  createContext(input = {}) {
    const context = createAgentContext(input);
    context.taskContext = this.stateManager.getTaskContext(context.conversationId || context.sessionId || context.requestId, {
      taskId: context.requestId,
      userIntent: input.intent || "",
      goal: context.userMessage
    });
    return context;
  }

  async run(inputContext = {}, strategies = []) {
    const context = this.createContext(inputContext);
    const stateSessionId = context.conversationId || context.sessionId || context.requestId;
    this.eventBus.publish(AGENT_EVENTS.INTENT_DETECTED, {
      sessionId: stateSessionId,
      taskId: context.requestId,
      userMessage: context.userMessage,
      goal: context.userMessage,
      userIntent: inputContext.intent || ""
    });
    this.trace("INFO", "[AgentController START]", {
      requestId: context.requestId,
      conversationId: context.conversationId,
      provider: context.provider,
      model: context.model,
      userMessage: context.userMessage.slice(0, 500)
    });
    this.record(context.traceId, "AgentController", "start", "running", {
      requestId: context.requestId,
      conversationId: context.conversationId,
      provider: context.provider,
      model: context.model
    });

    for (const strategy of strategies.filter(Boolean)) {
      const name = strategy.name || "unnamed_strategy";
      const canHandle = typeof strategy.canHandle === "function"
        ? await strategy.canHandle(context)
        : true;
      if (!canHandle) continue;

      this.trace("INFO", "[strategy selected]", {
        requestId: context.requestId,
        strategy: name
      });
      this.record(context.traceId, "AgentController", "strategy_selected", "running", {
        requestId: context.requestId,
        strategy: name
      });

      const raw = await strategy.execute(context);
      if (!raw || raw.handled === false) {
        this.trace("DEBUG", "[strategy skipped]", {
          requestId: context.requestId,
          strategy: name
        });
        this.record(context.traceId, "AgentController", "strategy_skipped", "skipped", {
          requestId: context.requestId,
          strategy: name
        });
        continue;
      }

      const result = this.normalizeResult(raw, name);
      this.eventBus.publish(result.success ? AGENT_EVENTS.TASK_COMPLETED : AGENT_EVENTS.TASK_FAILED, {
        sessionId: stateSessionId,
        intent: result.metadata?.intent || inputContext.intent || "",
        plan: result.tasks,
        lastError: result.success ? "" : result.message
      });
      this.trace("INFO", "[AgentController END]", {
        requestId: context.requestId,
        strategy: name,
        status: result.status,
        success: result.success
      });
      this.record(context.traceId, "AgentController", "end", result.status, {
        requestId: context.requestId,
        strategy: name,
        success: result.success
      });
      this.trace("INFO", "[FINAL]", {
        requestId: context.requestId,
        message: String(result.message || "").slice(0, 1000)
      });
      this.record(context.traceId, "ReplyBuilder", "final", result.status, {
        message: String(result.message || "").slice(0, 500)
      });
      return result;
    }

    const fallback = this.normalizeResult({
      success: false,
      status: "failed",
      message: "没有可用的 Agent 执行策略。",
      tasks: context.tasks,
      toolResults: context.toolCalls,
      verification: null
    }, "no_strategy");
    this.eventBus.publish(AGENT_EVENTS.TASK_FAILED, {
      sessionId: stateSessionId,
      lastError: fallback.message,
      plan: fallback.tasks
    });
    this.trace("ERROR", "[AgentController END]", {
      requestId: context.requestId,
      strategy: "no_strategy",
      status: fallback.status
    });
    this.record(context.traceId, "AgentController", "end", "failed", {
      requestId: context.requestId,
      strategy: "no_strategy"
    });
    return fallback;
  }

  normalizeResult(result = {}, strategy = "") {
    return createAgentResult(result, strategy);
  }

  normalizeStatus(status) {
    return normalizeAgentStatus(status);
  }

  trace(level, message, meta = {}) {
    if (!this.logger) return;
    this.logger("agent", level, message, meta);
  }

  record(traceId, agent, event, status, data = {}) {
    this.tracer?.record?.(traceId, agent, event, status, data);
  }
}

module.exports = { AgentController };
