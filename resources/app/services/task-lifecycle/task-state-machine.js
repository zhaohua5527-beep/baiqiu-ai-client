const fs = require("node:fs");
const path = require("node:path");
const { TaskHistoryManager, DEFAULT_TASK_LIFECYCLE_ROOT } = require("./task-history-manager");

const VALID_TRANSITIONS = Object.freeze({
  pending: ["scheduled", "blocked", "cancelled"],
  scheduled: ["active", "blocked", "cancelled"],
  active: ["completed", "failed", "blocked", "cancelled"],
  blocked: ["scheduled", "cancelled", "failed"],
  failed: ["scheduled", "cancelled"],
  completed: [],
  cancelled: []
});

function nowIso() {
  return new Date().toISOString();
}

class TaskStateMachine {
  constructor({ rootDir = DEFAULT_TASK_LIFECYCLE_ROOT, historyManager = null } = {}) {
    this.rootDir = rootDir;
    this.statesFile = path.join(rootDir, "task-states.json");
    this.historyManager = historyManager || new TaskHistoryManager({ rootDir });
    this.ensureStore();
  }

  initialize(task = {}) {
    const state = {
      taskId: task.taskId || task.id || "",
      goalId: task.goalId || "",
      agentId: task.agentId || "default-agent",
      status: task.status || "pending",
      previousStatus: "",
      allowedTransitions: VALID_TRANSITIONS[task.status || "pending"] || [],
      reason: task.reason || "",
      updatedAt: nowIso(),
      safety: this.safety()
    };
    this.saveState(state);
    this.historyManager.record({
      taskId: state.taskId,
      goalId: state.goalId,
      agentId: state.agentId,
      event: "state_initialized",
      to: state.status
    });
    return state;
  }

  transition(task = {}, nextStatus = "", reason = "") {
    const taskId = task.taskId || task.id || "";
    const current = this.getState(taskId) || this.initialize(task);
    const allowed = VALID_TRANSITIONS[current.status] || [];
    if (!allowed.includes(nextStatus)) {
      const blocked = {
        ...current,
        transitionAllowed: false,
        requestedStatus: nextStatus,
        reason: reason || `invalid transition from ${current.status} to ${nextStatus}`,
        updatedAt: nowIso()
      };
      this.historyManager.record({
        taskId,
        goalId: current.goalId,
        agentId: current.agentId,
        event: "state_transition_rejected",
        from: current.status,
        to: nextStatus,
        reason: blocked.reason
      });
      return blocked;
    }
    const next = {
      ...current,
      previousStatus: current.status,
      status: nextStatus,
      allowedTransitions: VALID_TRANSITIONS[nextStatus] || [],
      transitionAllowed: true,
      reason,
      updatedAt: nowIso(),
      safety: this.safety()
    };
    this.saveState(next);
    this.historyManager.record({
      taskId,
      goalId: current.goalId,
      agentId: current.agentId,
      event: "state_transition",
      from: current.status,
      to: nextStatus,
      reason
    });
    return next;
  }

  getState(taskId = "") {
    return this.load().states[taskId] || null;
  }

  listStates() {
    return Object.values(this.load().states);
  }

  saveState(state = {}) {
    const data = this.load();
    data.states[state.taskId] = state;
    this.writeJson(this.statesFile, { states: data.states });
  }

  safety() {
    return {
      lifecycleOnly: true,
      executesTool: false,
      bypassesToolSelector: false,
      bypassesVerifierCenter: false
    };
  }

  load() {
    return this.readJson(this.statesFile, { states: {} });
  }

  ensureStore() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.statesFile)) this.writeJson(this.statesFile, { states: {} });
  }

  readJson(file, fallback) {
    this.ensureStore();
    try {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      return fallback;
    }
  }

  writeJson(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  }
}

module.exports = { TaskStateMachine, VALID_TRANSITIONS };
