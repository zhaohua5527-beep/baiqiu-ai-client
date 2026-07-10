class TeamPlanner {
  constructor({ eventBus = null } = {}) {
    this.eventBus = eventBus;
  }

  buildTeamPlan({ team = null, goal = "", strategy = null, steps = [], sessionId = "", traceId = "" } = {}) {
    const assignments = Array.isArray(team?.assignments) ? team.assignments : [];
    const roleTasks = assignments.map((assignment) => ({
      id: assignment.assignmentId,
      agentId: assignment.agentId,
      role: assignment.role,
      responsibility: assignment.responsibility,
      dependsOn: assignment.dependsOn || [],
      deliverable: this.deliverableFor(assignment.role),
      relatedSteps: this.relatedSteps(assignment.role, steps)
    }));
    const graph = {
      teamId: team?.teamId || "",
      goal,
      strategyId: strategy?.strategyId || "",
      roles: roleTasks,
      dependencies: roleTasks.flatMap((task) => (task.dependsOn || []).map((dep) => ({ from: dep, to: task.id }))),
      status: "planned"
    };
    this.eventBus?.publish?.("TEAM_COMPLETED", {
      sessionId,
      traceId,
      teamId: graph.teamId,
      status: "planned",
      graph
    });
    return graph;
  }

  deliverableFor(role = "") {
    if (role === "supervisor") return "validated intent and task boundary";
    if (role === "planner") return "ordered plan with dependencies";
    if (role === "executor") return "tool execution result through normal execution chain";
    if (role === "verifier") return "verification result and quality status";
    return "role deliverable";
  }

  relatedSteps(role = "", steps = []) {
    if (role === "supervisor") return [];
    if (role === "planner") return steps.map((step) => step.id || step.taskId || step.toolId).filter(Boolean);
    if (role === "executor") return steps.filter((step) => step.executable !== false).map((step) => step.id || step.taskId || step.toolId).filter(Boolean);
    if (role === "verifier") return steps.filter((step) => step.verifier || step.toolId).map((step) => step.id || step.taskId || step.toolId).filter(Boolean);
    return [];
  }
}

module.exports = { TeamPlanner };
