const { createHash } = require("node:crypto");
const { AgentPolicyCenter } = require("../governance/agent-policy-center");

function stableHash(value) {
  let text = "";
  try {
    text = JSON.stringify(value || {}, Object.keys(value || {}).sort());
  } catch {
    text = String(value || "");
  }
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

class AgentGuard {
  constructor({
    maxRepeatedCalls = 3,
    maxExecutionMs = 120000,
    logger = null,
    clock = () => Date.now(),
    policyCenter = null
  } = {}) {
    this.policyCenter = policyCenter || new AgentPolicyCenter();
    const policy = this.policyCenter.getPolicy();
    this.maxRepeatedCalls = Number(maxRepeatedCalls) || Number(policy.maxRetry) || 3;
    this.maxExecutionMs = Number(maxExecutionMs) || Number(policy.maxExecutionTime) || 120000;
    this.logger = logger;
    this.clock = typeof clock === "function" ? clock : () => Date.now();
    this.sessions = new Map();
  }

  beforeToolCall({ sessionId = "", toolId = "", args = {} } = {}) {
    const id = String(sessionId || "global");
    const call = {
      sessionId: id,
      toolId: String(toolId || ""),
      argsHash: stableHash(args),
      timestamp: this.clock()
    };
    const state = this.sessions.get(id) || { calls: [], startedAt: call.timestamp, status: "normal" };
    state.calls.push(call);
    state.calls = state.calls.slice(-30);
    const repeated = this.countConsecutive(state.calls, call);
    const elapsed = call.timestamp - Number(state.startedAt || call.timestamp);
    let result = { allowed: true, status: "normal", repeated, elapsed, reason: "" };
    if (repeated > this.maxRepeatedCalls) {
      result = {
        allowed: false,
        status: "blocked",
        repeated,
        elapsed,
        reason: "任务重复执行，已停止保护。"
      };
      state.status = "blocked";
    } else if (elapsed > this.maxExecutionMs) {
      result = {
        allowed: false,
        status: "blocked",
        repeated,
        elapsed,
        reason: "任务执行时间过长，已停止保护。"
      };
      state.status = "blocked";
    } else if (repeated === this.maxRepeatedCalls) {
      result.status = "warning";
      result.reason = "检测到重复工具调用，继续观察。";
      state.status = "warning";
    } else {
      state.status = "normal";
    }
    this.sessions.set(id, state);
    this.logger?.log?.("guard", "beforeToolCall", { ...call, ...result });
    return result;
  }

  afterExecution({ sessionId = "", success = false, error = "" } = {}) {
    const id = String(sessionId || "global");
    const state = this.sessions.get(id) || { calls: [], startedAt: this.clock(), status: "normal" };
    state.lastResult = { success: Boolean(success), error: String(error || ""), timestamp: this.clock() };
    if (success) state.status = "normal";
    this.sessions.set(id, state);
    this.logger?.log?.("guard", "afterExecution", { sessionId: id, status: state.status, success, error });
    return state;
  }

  getState(sessionId = "") {
    const id = String(sessionId || "global");
    return this.sessions.get(id) || { calls: [], status: "normal", startedAt: null };
  }

  countConsecutive(calls, current) {
    let count = 0;
    for (let i = calls.length - 1; i >= 0; i -= 1) {
      const item = calls[i];
      if (item.toolId === current.toolId && item.argsHash === current.argsHash) count += 1;
      else break;
    }
    return count;
  }
}

module.exports = { AgentGuard, stableHash };
