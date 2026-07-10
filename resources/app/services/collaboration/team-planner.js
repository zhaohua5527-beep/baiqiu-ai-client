// Deprecated runtime implementation: kept for collaboration compatibility.
// Neural Core runtime uses services/neural-core/team-planner.js.

class TeamPlanner {
  constructor({ roleMap = null } = {}) {
    this.roleMap = roleMap || {
      supervisor: ["goal", "intent", "policy", "risk"],
      planner: ["plan", "decompose", "dependency"],
      executor: ["tool", "execute", "file", "browser", "folder", "skill"],
      verifier: ["verify", "check", "validate"],
      reply: ["reply", "summary", "user"]
    };
  }

  createTeamPlan(planObject = {}) {
    const steps = Array.isArray(planObject.steps) ? planObject.steps : Array.isArray(planObject.tasks) ? planObject.tasks : [];
    const assignments = steps.map((step, index) => ({
      id: `assign-${index + 1}`,
      taskId: step.id || step.taskId || `step-${index + 1}`,
      agent: this.agentForStep(step),
      role: this.roleForStep(step),
      step,
      dependsOn: Array.isArray(step.dependsOn) ? step.dependsOn : []
    }));
    const agents = Array.from(new Set(assignments.map((item) => item.agent)));
    return {
      goal: planObject.goal || planObject.sourceText || "",
      agents,
      assignments,
      status: assignments.length ? "planned" : "empty"
    };
  }

  splitByAgent(teamPlan = {}) {
    const grouped = {};
    for (const assignment of teamPlan.assignments || []) {
      if (!grouped[assignment.agent]) grouped[assignment.agent] = [];
      grouped[assignment.agent].push(assignment);
    }
    return grouped;
  }

  agentForStep(step = {}) {
    if (step.type === "clarification" || step.action === "clarify") return "SupervisorAgent";
    if (step.verifier && step.type === "verification") return "VerifierAgent";
    if (step.toolId) return "ExecutorAgent";
    return "PlannerAgent";
  }

  roleForStep(step = {}) {
    if (step.type === "clarification" || step.action === "clarify") return "clarify";
    if (step.toolId) return "execute";
    return "plan";
  }
}

module.exports = { TeamPlanner };
