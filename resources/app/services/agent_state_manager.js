const AGENT_STATES = Object.freeze({
  IDLE: "IDLE",
  UNDERSTANDING: "UNDERSTANDING",
  PLANNING: "PLANNING",
  SELECTING_TOOL: "SELECTING_TOOL",
  EXECUTING: "EXECUTING",
  VERIFYING: "VERIFYING",
  LEARNING: "LEARNING",
  COMPLETED: "COMPLETED"
});

const { AGENT_EVENTS, EVENT_TO_STATE } = require("./neural-core/agent-events");

const LEGACY_STATE_MAP = Object.freeze({
  idle: AGENT_STATES.IDLE,
  intent_detected: AGENT_STATES.UNDERSTANDING,
  understanding: AGENT_STATES.UNDERSTANDING,
  planning: AGENT_STATES.PLANNING,
  tool_selected: AGENT_STATES.SELECTING_TOOL,
  selecting_tool: AGENT_STATES.SELECTING_TOOL,
  executing: AGENT_STATES.EXECUTING,
  validating: AGENT_STATES.VERIFYING,
  verifying: AGENT_STATES.VERIFYING,
  learning: AGENT_STATES.LEARNING,
  completed: AGENT_STATES.COMPLETED,
  failed: AGENT_STATES.COMPLETED,
  cancelled: AGENT_STATES.COMPLETED,
  timeout: AGENT_STATES.COMPLETED
});

const STATE_AGENT_MAP = Object.freeze({
  [AGENT_STATES.IDLE]: "supervisor",
  [AGENT_STATES.UNDERSTANDING]: "supervisor",
  [AGENT_STATES.PLANNING]: "planner",
  [AGENT_STATES.SELECTING_TOOL]: "tool_selector",
  [AGENT_STATES.EXECUTING]: "executor",
  [AGENT_STATES.VERIFYING]: "verifier",
  [AGENT_STATES.LEARNING]: "learning",
  [AGENT_STATES.COMPLETED]: "reply"
});

function now() {
  return Date.now();
}

function makeTaskId(prefix = "task") {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function normalizeState(state = AGENT_STATES.IDLE) {
  const value = String(state || "").trim();
  if (AGENT_STATES[value]) return AGENT_STATES[value];
  const upper = value.toUpperCase();
  if (Object.values(AGENT_STATES).includes(upper)) return upper;
  return LEGACY_STATE_MAP[value.toLowerCase()] || AGENT_STATES.IDLE;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

class AgentStateManager {
  constructor({ maxHistory = 500 } = {}) {
    this.maxHistory = maxHistory;
    this.sessions = new Map();
    this.unsubscribe = null;
  }

  attachEventBus(eventBus) {
    if (!eventBus || typeof eventBus.subscribe !== "function") return null;
    if (this.unsubscribe) this.unsubscribe();
    this.unsubscribe = eventBus.subscribe("*", (event) => this.consumeEvent(event));
    return this.unsubscribe;
  }

  consumeEvent(event = {}) {
    const state = EVENT_TO_STATE[event.type];
    if (!state) return null;
    const data = event.payload || {};
    if (event.type === AGENT_EVENTS.TOOL_SELECTED) return this.recordToolSelection(event.sessionId, data);
    if (event.type === AGENT_EVENTS.TOOL_RESULT) return this.recordExecution(event.sessionId, data);
    if (event.type === AGENT_EVENTS.VERIFICATION_DONE) return this.recordVerification(event.sessionId, data.verification || data);
    if (event.type === AGENT_EVENTS.MEMORY_UPDATED) return this.recordLearning(event.sessionId, data);
    if (event.type === AGENT_EVENTS.PLAN_CREATED) return this.transition(event.sessionId, state, { ...data, plan: data.plan || data });
    return this.transition(event.sessionId, state, data);
  }

  createTaskContext(input = {}) {
    return {
      taskId: input.taskId || input.requestId || makeTaskId("neural-task"),
      userIntent: input.userIntent || input.intent || "",
      goal: input.goal || input.userMessage || input.message || "",
      plan: input.plan || null,
      currentStep: input.currentStep || AGENT_STATES.IDLE,
      tools: safeArray(input.tools),
      executionHistory: safeArray(input.executionHistory),
      errors: safeArray(input.errors),
      memoryUpdates: safeArray(input.memoryUpdates)
    };
  }

  getTaskContext(sessionId = "global", seed = {}) {
    const key = sessionId || "global";
    if (!this.sessions.has(key)) {
      this.sessions.set(key, {
        sessionId: key,
        state: AGENT_STATES.IDLE,
        legacyState: "idle",
        currentAgent: STATE_AGENT_MAP[AGENT_STATES.IDLE],
        taskContext: this.createTaskContext(seed),
        history: [],
        updatedAt: now()
      });
    } else if (Object.keys(seed || {}).length) {
      const record = this.sessions.get(key);
      record.taskContext = this.mergeTaskContext(record.taskContext, seed);
      record.updatedAt = now();
    }
    return this.sessions.get(key).taskContext;
  }

  transition(sessionId = "global", state = AGENT_STATES.IDLE, patch = {}) {
    const key = sessionId || "global";
    const neuralState = normalizeState(state);
    const record = this.sessions.get(key) || {
      sessionId: key,
      state: AGENT_STATES.IDLE,
      legacyState: "idle",
      currentAgent: STATE_AGENT_MAP[AGENT_STATES.IDLE],
      taskContext: this.createTaskContext(patch),
      history: [],
      updatedAt: now()
    };
    record.state = neuralState;
    record.legacyState = String(state || "").toLowerCase() || this.legacyFor(neuralState);
    record.currentAgent = patch.currentAgent || patch.agent || STATE_AGENT_MAP[neuralState] || "supervisor";
    record.taskContext = this.mergeTaskContext(record.taskContext, {
      ...patch,
      currentStep: neuralState
    });
    record.updatedAt = now();
    record.history.push({
      state: neuralState,
      legacyState: record.legacyState,
      currentAgent: record.currentAgent,
      patch: this.compactPatch(patch),
      timestamp: record.updatedAt
    });
    record.history = record.history.slice(-this.maxHistory);
    this.sessions.set(key, record);
    return this.snapshot(key);
  }

  start(sessionId = "global", input = {}) {
    const context = this.createTaskContext(input);
    this.sessions.set(sessionId || "global", {
      sessionId: sessionId || "global",
      state: AGENT_STATES.IDLE,
      legacyState: "idle",
      currentAgent: STATE_AGENT_MAP[AGENT_STATES.IDLE],
      taskContext: context,
      history: [],
      updatedAt: now()
    });
    return this.transition(sessionId, AGENT_STATES.UNDERSTANDING, input);
  }

  recordPlan(sessionId = "global", plan = null) {
    return this.transition(sessionId, AGENT_STATES.PLANNING, { plan });
  }

  recordToolSelection(sessionId = "global", tool = {}) {
    const context = this.getTaskContext(sessionId);
    context.tools.push(tool);
    return this.transition(sessionId, AGENT_STATES.SELECTING_TOOL, { tools: context.tools, logicalTool: tool.logicalTool, toolId: tool.toolId || tool.id });
  }

  recordExecution(sessionId = "global", execution = {}) {
    const context = this.getTaskContext(sessionId);
    context.executionHistory.push({
      taskId: execution.taskId || context.taskId,
      toolId: execution.toolId || "",
      success: execution.success === true,
      status: execution.status || "",
      timestamp: now()
    });
    if (execution.error) context.errors.push(execution.error);
    return this.transition(sessionId, AGENT_STATES.EXECUTING, { executionHistory: context.executionHistory, errors: context.errors, toolId: execution.toolId });
  }

  recordVerification(sessionId = "global", verification = {}) {
    return this.transition(sessionId, AGENT_STATES.VERIFYING, {
      verification,
      errors: verification?.status === "failed" && verification.reason
        ? [...this.getTaskContext(sessionId).errors, verification.reason]
        : this.getTaskContext(sessionId).errors
    });
  }

  recordLearning(sessionId = "global", update = {}) {
    const context = this.getTaskContext(sessionId);
    context.memoryUpdates.push(update);
    return this.transition(sessionId, AGENT_STATES.LEARNING, { memoryUpdates: context.memoryUpdates });
  }

  complete(sessionId = "global", patch = {}) {
    return this.transition(sessionId, AGENT_STATES.COMPLETED, patch);
  }

  snapshot(sessionId = "global") {
    const record = this.sessions.get(sessionId || "global");
    if (!record) return null;
    return {
      sessionId: record.sessionId,
      state: record.state,
      legacyState: record.legacyState,
      currentAgent: record.currentAgent,
      taskContext: record.taskContext,
      history: record.history,
      updatedAt: record.updatedAt
    };
  }

  mergeTaskContext(current = {}, patch = {}) {
    const next = {
      ...this.createTaskContext(current),
      ...current
    };
    if (patch.taskContext && typeof patch.taskContext === "object") {
      Object.assign(next, patch.taskContext);
    }
    if (patch.taskId) next.taskId = patch.taskId;
    if (patch.intent || patch.userIntent) next.userIntent = patch.userIntent || patch.intent;
    if (patch.goal || patch.userMessage || patch.message) next.goal = patch.goal || patch.userMessage || patch.message;
    if (patch.plan) next.plan = patch.plan;
    if (patch.currentStep) next.currentStep = normalizeState(patch.currentStep);
    if (patch.tools) next.tools = safeArray(patch.tools);
    if (patch.executionHistory) next.executionHistory = safeArray(patch.executionHistory);
    if (patch.errors) next.errors = safeArray(patch.errors);
    if (patch.memoryUpdates) next.memoryUpdates = safeArray(patch.memoryUpdates);
    if (patch.logicalTool || patch.toolId) {
      const tool = { logicalTool: patch.logicalTool || "", toolId: patch.toolId || patch.logicalTool || "" };
      if (!next.tools.some((item) => (item.toolId || item.id || item.logicalTool) === (tool.toolId || tool.logicalTool))) next.tools.push(tool);
    }
    if (patch.error || patch.lastError) next.errors = [...next.errors, patch.error || patch.lastError].filter(Boolean);
    return next;
  }

  compactPatch(patch = {}) {
    return {
      intent: patch.intent || patch.userIntent || "",
      toolId: patch.toolId || "",
      logicalTool: patch.logicalTool || "",
      currentAgent: patch.currentAgent || patch.agent || "",
      error: patch.error || patch.lastError || ""
    };
  }

  legacyFor(state = AGENT_STATES.IDLE) {
    if (state === AGENT_STATES.IDLE) return "idle";
    if (state === AGENT_STATES.UNDERSTANDING) return "intent_detected";
    if (state === AGENT_STATES.PLANNING) return "planning";
    if (state === AGENT_STATES.SELECTING_TOOL) return "tool_selected";
    if (state === AGENT_STATES.EXECUTING) return "executing";
    if (state === AGENT_STATES.VERIFYING) return "validating";
    if (state === AGENT_STATES.LEARNING) return "learning";
    return "completed";
  }
}

const defaultAgentStateManager = new AgentStateManager();

function getDefaultAgentStateManager() {
  if (!defaultAgentStateManager.unsubscribe) {
    try {
      const { getDefaultAgentEventBus } = require("./neural-core/agent-event-bus");
      defaultAgentStateManager.attachEventBus(getDefaultAgentEventBus());
    } catch {}
  }
  return defaultAgentStateManager;
}

module.exports = {
  AgentStateManager,
  AGENT_STATES,
  normalizeState,
  getDefaultAgentStateManager
};
