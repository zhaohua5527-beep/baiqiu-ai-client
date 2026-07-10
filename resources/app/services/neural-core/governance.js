class NeuralGovernance {
  constructor({ maxLoops = 50 } = {}) {
    this.maxLoops = maxLoops;
    this.eventCounts = new Map();
  }

  check(event = {}) {
    const data = event.payload || {};
    const key = `${event.sessionId || "global"}:${event.type}`;
    const count = Number(this.eventCounts.get(key) || 0) + 1;
    this.eventCounts.set(key, count);
    if (count > this.maxLoops) {
      return { allowed: false, status: "blocked", reason: "max neural event loop exceeded" };
    }
    const highRisk = data.riskLevel === "high" || data.needUserConfirm === true || (data.requiresPermission === true && data.permissionScope === "system");
    if (event.type === "TOOL_EXECUTING" && highRisk && data.confirmed !== true) {
      return { allowed: false, status: "confirm_required", reason: "high risk tool requires confirmation" };
    }
    if (data.error && /fatal|panic|uncaught/i.test(String(data.error))) {
      return { allowed: false, status: "abnormal_stop", reason: String(data.error) };
    }
    return { allowed: true, status: "allowed", reason: "" };
  }
}

module.exports = { NeuralGovernance };
