const { AgentRegistry } = require("./agent-registry");
const { CollaborationProtocol } = require("./collaboration-protocol");

function metric(name, data) {
  try { require("./agent-event-bus").recordRuntimeMetric?.(name, data); } catch {}
}

function roleNeedsFor({ taskType = "", goal = "", strategy = null } = {}) {
  if (Array.isArray(strategy?.teamNeeds) && strategy.teamNeeds.length) return strategy.teamNeeds;
  const text = `${taskType} ${goal}`.toLowerCase();
  const base = [
    { role: "supervisor", responsibility: "understand goal and keep task aligned", capabilities: ["understand_goal"] },
    { role: "planner", responsibility: "create task graph and dependencies", capabilities: ["create_plan", "build_task_graph"] }
  ];
  if (/calculator|html|code|file|folder|create|open|skill|shutdown|dev\.code|file\.create|system/i.test(text)) {
    base.push({ role: "executor", responsibility: "execute assigned tool tasks through the normal chain", capabilities: ["execute_tool_task"] });
    base.push({ role: "verifier", responsibility: "verify results and detect failed work", capabilities: ["verify_result"] });
  }
  return base;
}

class AgentManager {
  constructor({ registry = null, protocol = null, eventBus = null } = {}) {
    this.eventBus = eventBus;
    this.registry = registry || new AgentRegistry({ eventBus });
    this.protocol = protocol || new CollaborationProtocol({ eventBus });
  }

  createTeam({ taskType = "", goal = "", strategy = null, sessionId = "", traceId = "" } = {}) {
    const startedAt = Date.now();
    let needs = roleNeedsFor({ taskType, goal, strategy });
    let assignments;
    try {
      assignments = needs.map((need, index) => {
      const matches = this.registry.matchAgents({
        role: need.role,
        capabilities: need.capabilities || [],
        taskType,
        limit: 1
      });
      const agent = matches[0] || this.registry.registerAgent({
        agentId: `${need.role}-agent`,
        name: `${need.role}Agent`,
        role: need.role,
        capabilities: need.capabilities || [],
        skills: [],
        successRate: 1,
        confidence: 0.75
      });
      return {
        assignmentId: `assignment-${index + 1}-${need.role}`,
        agentId: agent.agentId,
        agentName: agent.name,
        role: need.role,
        responsibility: need.responsibility,
        capabilities: need.capabilities || [],
        matchScore: agent.matchScore || 1,
        status: "assigned",
        dependsOn: index === 0 ? [] : [`assignment-${index}-${needs[index - 1].role}`]
      };
      });
    } catch (error) {
      needs = [{ role: "executor", responsibility: "execute through normal runtime", capabilities: ["execute_tool_task"] }];
      assignments = [{
        assignmentId: "assignment-1-executor",
        agentId: "executor-agent",
        agentName: "executorAgent",
        role: "executor",
        responsibility: "execute through normal runtime",
        capabilities: ["execute_tool_task"],
        matchScore: 0.5,
        status: "assigned",
        dependsOn: [],
        recovered: true,
        errorCode: "NC9001",
        reason: error?.message || String(error)
      }];
    }
    const team = {
      teamId: `team-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      taskType,
      goal,
      strategyId: strategy?.strategyId || "",
      assignments,
      createdAt: new Date().toISOString()
    };
    this.eventBus?.publish?.("TEAM_CREATED", { sessionId, traceId, team });
    for (const assignment of assignments) {
      this.eventBus?.publish?.("TASK_ASSIGNED", { sessionId, traceId, teamId: team.teamId, assignment });
      if (assignment.dependsOn.length) {
        this.protocol.createTransfer({
          fromAgent: assignments[Math.max(0, assignments.indexOf(assignment) - 1)]?.agentId || "agent-manager",
          toAgent: assignment.agentId,
          taskId: assignment.assignmentId,
          deliverable: assignment.responsibility,
          input: { goal, taskType },
          status: "pending"
        });
      }
    }
    metric("AgentManager.createTeam", { duration: Date.now() - startedAt, success: !assignments.some((item) => item.recovered) });
    return team;
  }

  updateAgentResult(agentId, result = {}) {
    const updated = this.registry.updateSuccessRate(agentId, result);
    this.eventBus?.publish?.("AGENT_COMPLETED", {
      agentId,
      success: result.success === true,
      taskType: result.taskType || "",
      duration: result.duration || 0
    });
    return updated;
  }

  async dispatchTask({ taskOrchestrator = null, sessionId = "", message = "", planObject = null, contextPatch = {}, signal = null } = {}) {
    const dispatchStartedAt = Date.now();
    if (!taskOrchestrator || typeof taskOrchestrator.execute !== "function") {
      throw new Error("AgentManager.dispatchTask requires TaskOrchestrator");
    }
    const traceId = contextPatch.traceId || "";
    const team = planObject?.agentTeam || this.createTeam({
      taskType: planObject?.primaryIntent || "",
      goal: message || planObject?.goal || "",
      strategy: planObject?.strategyResult || null,
      sessionId,
      traceId
    });
    const executor = (team.assignments || []).find((item) => item.role === "executor") || null;
    this.eventBus?.publish?.("TASK_ASSIGNED", {
      sessionId,
      traceId,
      teamId: team.teamId,
      assignment: executor || { role: "executor", agentId: "executor-agent", status: "assigned" },
      dispatch: true
    });
    const startedAt = Date.now();
    let result;
    try {
      result = await taskOrchestrator.execute({
        sessionId,
        message,
        planObject,
        contextPatch: {
          ...contextPatch,
          agentTeam: team,
          dispatchedBy: "AgentManager"
        },
        signal
      });
    } catch (error) {
      const code = "NC9001";
      result = {
        success: false,
        normalized: {
          success: false,
          status: "failed",
          error: `${code} Unknown Runtime Failure: ${error?.message || error}`,
          errorCode: code,
          recoverable: true
        },
        error: `${code} Unknown Runtime Failure: ${error?.message || error}`
      };
    }
    this.updateAgentResult(executor?.agentId || "executor-agent", {
      success: Boolean(result?.normalized?.success ?? result?.success),
      taskType: planObject?.primaryIntent || "",
      duration: Date.now() - startedAt
    });
    metric("AgentManager.dispatchTask", { duration: Date.now() - dispatchStartedAt, success: Boolean(result?.normalized?.success ?? result?.success) });
    return {
      ...result,
      agentManager: {
        dispatched: true,
        teamId: team.teamId,
        executorAgentId: executor?.agentId || "executor-agent"
      }
    };
  }
}

module.exports = { AgentManager, roleNeedsFor };
