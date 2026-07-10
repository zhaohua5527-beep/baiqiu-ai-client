const fs = require("node:fs");
const path = require("node:path");
const { DEFAULT_POLICY, DEFAULT_GOVERNANCE_ROOT } = require("./agent-policy-center");

class AgentBudgetManager {
  constructor({ rootDir = path.join(DEFAULT_GOVERNANCE_ROOT, "budget"), policyCenter = null } = {}) {
    this.rootDir = rootDir;
    this.policyCenter = policyCenter;
    fs.mkdirSync(rootDir, { recursive: true });
  }

  startSession(sessionId = "", taskId = "") {
    const state = this.load(sessionId);
    if (!state.sessionId) {
      Object.assign(state, {
        sessionId,
        taskId,
        stepCount: 0,
        toolCalls: 0,
        retryCount: 0,
        startTime: Date.now(),
        duration: 0,
        status: "running"
      });
      this.save(state);
    }
    return state;
  }

  consumeStep(sessionId = "", taskId = "") {
    const state = this.startSession(sessionId, taskId);
    state.stepCount = Number(state.stepCount || 0) + 1;
    return this.saveAndCheck(state);
  }

  consumeToolCall(sessionId = "", taskId = "") {
    const state = this.startSession(sessionId, taskId);
    state.toolCalls = Number(state.toolCalls || 0) + 1;
    return this.saveAndCheck(state);
  }

  consumeRetry(sessionId = "", taskId = "") {
    const state = this.startSession(sessionId, taskId);
    state.retryCount = Number(state.retryCount || 0) + 1;
    return this.saveAndCheck(state);
  }

  checkBudget(sessionId = "") {
    return this.evaluate(this.load(sessionId));
  }

  saveAndCheck(state) {
    state.duration = Date.now() - Number(state.startTime || Date.now());
    const check = this.evaluate(state);
    state.status = check.allowed ? "running" : check.status;
    this.save(state);
    return check;
  }

  evaluate(state = {}) {
    const policy = this.policyCenter?.getPolicy?.() || DEFAULT_POLICY;
    const duration = Date.now() - Number(state.startTime || Date.now());
    if (Number(state.stepCount || 0) > Number(policy.maxSteps)) return this.block("budget_exceeded", "step budget exceeded", state);
    if (Number(state.toolCalls || 0) > Number(policy.maxToolCalls)) return this.block("budget_exceeded", "tool call budget exceeded", state);
    if (Number(state.retryCount || 0) > Number(policy.maxRetry)) return this.block("budget_exceeded", "retry budget exceeded", state);
    if (duration > Number(policy.maxExecutionTime)) return this.block("budget_exceeded", "execution time budget exceeded", state);
    return { allowed: true, status: "running", reason: "", state: { ...state, duration } };
  }

  block(status, reason, state) {
    return { allowed: false, status, reason, state };
  }

  fileFor(sessionId = "") {
    const safe = String(sessionId || "default").replace(/[^a-zA-Z0-9_.-]/g, "_");
    return path.join(this.rootDir, `${safe}.json`);
  }

  load(sessionId = "") {
    try {
      return JSON.parse(fs.readFileSync(this.fileFor(sessionId), "utf8"));
    } catch {
      return {};
    }
  }

  save(state = {}) {
    fs.mkdirSync(this.rootDir, { recursive: true });
    fs.writeFileSync(this.fileFor(state.sessionId || "default"), JSON.stringify(state, null, 2), "utf8");
    return state;
  }
}

module.exports = { AgentBudgetManager };
