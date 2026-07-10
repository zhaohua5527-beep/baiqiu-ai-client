const { getDefaultAgentEventBus, AGENT_EVENTS } = require("../neural-core/agent-event-bus");
const { AgentManager } = require("../neural-core/agent-manager");

class ProductEventAdapter {
  constructor({ eventBus = null, agentManager = null, taskOrchestrator = null } = {}) {
    this.eventBus = eventBus || getDefaultAgentEventBus();
    this.agentManager = agentManager || new AgentManager({ eventBus: this.eventBus });
    this.taskOrchestrator = taskOrchestrator;
  }

  async submit(task = {}) {
    const sessionId = task.sessionId || task.taskId || "product-session";
    const traceId = task.traceId || task.taskId || sessionId;
    this.eventBus.publish(AGENT_EVENTS.INTENT_DETECTED, {
      sessionId,
      traceId,
      taskId: task.taskId,
      intent: task.intent || "",
      userIntent: task.input || task.message || "",
      goal: task.input || task.message || "",
      productId: task.productId || ""
    });

    if (!this.taskOrchestrator) {
      return {
        success: false,
        status: "failed",
        error: "ProductEventAdapter requires taskOrchestrator",
        taskId: task.taskId
      };
    }
    if (!task.planObject) {
      return {
        taskId: task.taskId,
        sessionId,
        traceId,
        success: false,
        status: "failed",
        result: {
          handled: true,
          normalized: {
            success: false,
            error: "Product task requires a Neural Core plan",
            result: null
          },
          text: "请补充具体需求后我再执行。"
        }
      };
    }

    const result = await this.agentManager.dispatchTask({
      taskOrchestrator: this.taskOrchestrator,
      sessionId,
      message: task.input || task.message || "",
      planObject: task.planObject,
      contextPatch: {
        ...(task.context || {}),
        traceId,
        productId: task.productId || "",
        productTaskId: task.taskId
      },
      signal: task.signal || null
    });

    return {
      taskId: task.taskId,
      sessionId,
      traceId,
      success: Boolean(result?.normalized?.success ?? result?.success),
      status: (result?.normalized?.success ?? result?.success) ? "success" : "failed",
      result
    };
  }

  getTrace(traceId = "") {
    return this.eventBus.getTrace(traceId);
  }
}

module.exports = { ProductEventAdapter };
