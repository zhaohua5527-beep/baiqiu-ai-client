const { AgentPolicyCenter } = require("../governance/agent-policy-center");
const { AgentHealthMonitor } = require("../governance/agent-health-monitor");
const { getDefaultAgentStateManager } = require("../agent_state_manager");
const { getDefaultAgentEventBus, AGENT_EVENTS } = require("../neural-core/agent-event-bus");

class SupervisorAgent {
  constructor({ intentAgent = null, capabilityCenter = null, logger = null, tracer = null, policyCenter = null, healthMonitor = null, stateManager = null, eventBus = null } = {}) {
    this.intentAgent = intentAgent;
    this.capabilityCenter = capabilityCenter;
    this.logger = logger;
    this.tracer = tracer;
    this.policyCenter = policyCenter || new AgentPolicyCenter();
    this.healthMonitor = healthMonitor || new AgentHealthMonitor();
    this.stateManager = stateManager || getDefaultAgentStateManager();
    this.eventBus = eventBus || getDefaultAgentEventBus();
  }

  analyze(input = {}) {
    const startedAt = Date.now();
    const userMessage = String(input.userMessage || input.message || "");
    const sessionId = input.sessionId || input.context?.sessionId || input.traceId || "global";
    this.eventBus.publish(AGENT_EVENTS.INTENT_DETECTED, {
      sessionId,
      userMessage,
      goal: userMessage,
      currentAgent: "supervisor"
    });
    const intentAnalysis = this.intentAgent?.analyze?.(userMessage, input.context || {}) || {
      text: userMessage,
      primaryIntent: "general.chat",
      intents: [{ intent: "general.chat", clause: userMessage }]
    };
    const intent = intentAnalysis.primaryIntent || "general.chat";
    const needPlan = intent !== "general.chat";
    const capability = this.capabilityCenter?.canPlanIntent?.(intent, { userMessage }) || { available: true };
    const policy = this.policyCenter.checkTask({ intent, riskLevel: input.riskLevel || "" }, {
      stepCount: input.stepCount || 1,
      toolCalls: input.toolCalls || 0
    });
    const result = {
      intent,
      goal: userMessage,
      needPlan: needPlan && policy.status !== "policy_block" && policy.status !== "budget_exceeded",
      capability,
      policy,
      intentAnalysis
    };
    this.eventBus.publish(result.needPlan ? AGENT_EVENTS.PLAN_CREATED : AGENT_EVENTS.TASK_COMPLETED, {
      sessionId,
      intent,
      userIntent: intent,
      goal: userMessage,
      currentAgent: result.needPlan ? "planner" : "reply",
      taskContext: input.context?.taskContext
    });
    this.logger?.log?.("supervisor", "analyze", {
      intent,
      needPlan,
      capability: capability.status || (capability.available ? "available" : "missing"),
      goal: userMessage.slice(0, 500)
    });
    this.tracer?.record?.(input.traceId, "SupervisorAgent", "intent_analyze", capability.available === false ? "blocked" : "success", {
      intent,
      needPlan,
      capability: capability.status || (capability.available ? "available" : "missing"),
      goal: userMessage.slice(0, 500)
    });
    this.tracer?.recordGovernance?.(input.traceId, "policy_check", policy.status, {
      intent,
      allowed: policy.allowed,
      reason: policy.reason
    });
    this.healthMonitor[policy.allowed ? "recordSuccess" : "recordFailure"]?.("SupervisorAgent", Date.now() - startedAt);
    this.tracer?.recordGovernance?.(input.traceId, "health_record", policy.allowed ? "success" : "failed", {
      agentName: "SupervisorAgent"
    });
    return result;
  }
}

module.exports = { SupervisorAgent };
