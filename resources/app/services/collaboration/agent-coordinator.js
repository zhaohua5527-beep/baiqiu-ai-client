const { AgentMessageBus } = require("./agent-message-bus");
const { TeamPlanner } = require("./team-planner");
const { AgentCommunicationProtocol } = require("../protocol/agent-communication-protocol");

class AgentCoordinator {
  constructor({ messageBus = null, teamPlanner = null, protocol = null } = {}) {
    this.messageBus = messageBus || new AgentMessageBus();
    this.teamPlanner = teamPlanner || new TeamPlanner();
    this.protocol = protocol || new AgentCommunicationProtocol();
  }

  coordinate({ planObject = {}, sessionId = "", traceId = "" } = {}) {
    const teamPlan = this.teamPlanner.createTeamPlan(planObject);
    const grouped = this.teamPlanner.splitByAgent(teamPlan);
    const contracts = [];
    for (const assignment of teamPlan.assignments || []) {
      const created = this.protocol.contractFromAssignment(assignment);
      contracts.push(created);
      this.protocol.syncState(assignment.agent, {
        status: "assigned",
        currentTask: assignment.taskId,
        currentStage: assignment.role,
        sessionId,
        traceId
      });
    }
    const messages = [];
    for (const [agent, assignments] of Object.entries(grouped)) {
      messages.push(this.messageBus.publish({
        from: "AgentCoordinator",
        to: agent,
        type: "assignment",
        payload: { assignments },
        sessionId,
        traceId
      }));
    }
    return {
      teamPlan,
      grouped,
      contracts,
      messages,
      status: teamPlan.status
    };
  }

  summarize(results = []) {
    const normalized = Array.isArray(results) ? results : [];
    const successCount = normalized.filter((item) => item.success === true || item.status === "success").length;
    const failedCount = normalized.filter((item) => item.success === false || item.status === "failed").length;
    return {
      success: failedCount === 0,
      total: normalized.length,
      successCount,
      failedCount,
      results: normalized,
      summary: failedCount === 0 ? "all_assignments_completed" : "some_assignments_failed"
    };
  }
}

module.exports = { AgentCoordinator };
