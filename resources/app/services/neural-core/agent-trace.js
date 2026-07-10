class AgentTrace {
  constructor({ maxItems = 500 } = {}) {
    this.maxItems = maxItems;
    this.traces = new Map();
  }

  record(event = {}) {
    const traceId = event.traceId || event.sessionId || "global";
    const current = this.traces.get(traceId) || {
      traceId,
      sessionId: event.sessionId || "",
      userIntent: "",
      plan: null,
      toolSelections: [],
      executions: [],
      verifications: [],
      errors: [],
      repairs: [],
      agents: [],
      teams: [],
      assignments: [],
      transfers: [],
      events: [],
      startedAt: event.timestamp || Date.now(),
      updatedAt: event.timestamp || Date.now()
    };
    current.events.push(event);
    current.events = current.events.slice(-this.maxItems);
    current.updatedAt = event.timestamp || Date.now();
    this.applyEvent(current, event);
    this.traces.set(traceId, current);
    return this.snapshot(traceId);
  }

  applyEvent(trace, event) {
    const data = event.payload || {};
    if (event.type === "INTENT_DETECTED") trace.userIntent = data.intent || data.userIntent || trace.userIntent;
    if (event.type === "PLAN_CREATED") trace.plan = data.plan || trace.plan;
    if (event.type === "TOOL_SELECTED") trace.toolSelections.push({ toolId: data.toolId || data.id || "", logicalTool: data.logicalTool || "", intent: data.intent || "", at: event.timestamp });
    if (event.type === "TOOL_EXECUTING") trace.executions.push({ toolId: data.toolId || "", status: "running", args: data.args || null, at: event.timestamp });
    if (event.type === "TOOL_RESULT") {
      trace.executions.push({ toolId: data.toolId || "", success: data.success === true, status: data.status || "", result: data.result || null, error: data.error || "", at: event.timestamp });
      if (data.error) trace.errors.push(data.error);
      if (data.repair || data.recoveryAction) trace.repairs.push(data.repair || data.recoveryAction);
    }
    if (event.type === "VERIFICATION_DONE") trace.verifications.push({ status: data.status || "", verification: data.verification || data, reason: data.reason || "", at: event.timestamp });
    if (event.type === "TASK_FAILED" && (data.error || data.lastError)) trace.errors.push(data.error || data.lastError);
    if (event.type === "AGENT_REGISTERED") trace.agents.push({ agentId: data.agentId || "", role: data.role || "", name: data.name || "", at: event.timestamp });
    if (event.type === "TEAM_CREATED") trace.teams.push({ teamId: data.team?.teamId || data.teamId || "", strategyId: data.team?.strategyId || data.strategyId || "", assignments: data.team?.assignments || [], reason: data.reason || "", at: event.timestamp });
    if (event.type === "TASK_ASSIGNED") trace.assignments.push({ teamId: data.teamId || "", assignment: data.assignment || data, reason: data.reason || "", at: event.timestamp });
    if (event.type === "TASK_TRANSFERRED") trace.transfers.push({ fromAgent: data.fromAgent || "", toAgent: data.toAgent || "", taskId: data.taskId || "", status: data.status || "", deliverable: data.deliverable || "", at: event.timestamp });
    if (event.type === "AGENT_COMPLETED") trace.agents.push({ agentId: data.agentId || "", status: "completed", success: data.success, taskId: data.taskId || "", at: event.timestamp });
    if (event.type === "TEAM_COMPLETED") trace.teams.push({ teamId: data.teamId || "", status: data.status || "completed", graph: data.graph || null, at: event.timestamp });
  }

  snapshot(traceId = "global") {
    const trace = this.traces.get(traceId);
    return trace ? this.safeClone(trace) : null;
  }

  recent(limit = 10) {
    return Array.from(this.traces.values())
      .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
      .slice(0, limit)
      .map((item) => this.safeClone(item));
  }

  safeClone(value) {
    const seen = new WeakSet();
    return JSON.parse(JSON.stringify(value, (key, item) => {
      if (key === "taskContext") return "[taskContext]";
      if (item && typeof item === "object") {
        if (seen.has(item)) return "[Circular]";
        seen.add(item);
      }
      return item;
    }));
  }
}

module.exports = { AgentTrace };
