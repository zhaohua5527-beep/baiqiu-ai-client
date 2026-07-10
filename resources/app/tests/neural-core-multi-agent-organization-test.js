const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const { AgentEventBus } = require("../services/neural-core/agent-event-bus");
const { AgentRegistry } = require("../services/neural-core/agent-registry");
const { AgentManager } = require("../services/neural-core/agent-manager");
const { CollaborationProtocol } = require("../services/neural-core/collaboration-protocol");
const { TeamPlanner } = require("../services/neural-core/team-planner");
const { StrategyEngine } = require("../services/neural-core/strategy-engine");
const { DecisionEngine } = require("../services/neural-core/decision-engine");
const { PlannerAgent } = require("../services/planner-agent");

function root(name) {
  const dir = path.join("D:\\BaiQiuAI", "data", "neural-core-tests", `run-${process.pid}`, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function run() {
  const dir = root("multi-agent");
  const eventBus = new AgentEventBus({ reflectionEngine: null });
  const registry = new AgentRegistry({ filePath: path.join(dir, "registry.json"), eventBus });
  registry.registerAgent({
    agentId: "coding-agent",
    name: "CodingAgent",
    role: "executor",
    skills: ["code", "tool"],
    capabilities: ["execute_tool_task"],
    successRate: 0.96,
    confidence: 0.9
  });
  const matched = registry.matchAgents({
    role: "executor",
    capabilities: ["execute_tool_task"],
    taskType: "dev.code.calculator"
  });
  assert.strictEqual(matched[0].agentId, "coding-agent", "Registry should match best available executor");

  const strategyEngine = new StrategyEngine();
  const strategy = strategyEngine.chooseStrategy({
    taskType: "dev.code.calculator",
    experiences: [{ taskType: "dev.code.calculator", toolsUsed: ["calculator_creator"], successRate: 0.98, confidence: 0.9 }],
    riskLevel: "low",
    goal: "create calculator"
  });
  assert(strategy.teamNeeds.some((item) => item.role === "executor"), "Strategy should expose team needs");

  const protocol = new CollaborationProtocol({ eventBus });
  const manager = new AgentManager({ registry, protocol, eventBus });
  const team = manager.createTeam({
    taskType: "dev.code.calculator",
    goal: "create calculator",
    strategy,
    sessionId: "multi-agent-test",
    traceId: "multi-agent-test"
  });
  assert(team.assignments.length >= 4, "AgentManager should create a role team");
  assert(team.assignments.some((item) => item.role === "verifier"), "Team should include verifier role");
  assert(protocol.listTransfers().length >= 1, "Collaboration protocol should record task handoff");

  const teamPlanner = new TeamPlanner({ eventBus });
  const graph = teamPlanner.buildTeamPlan({
    team,
    goal: "create calculator",
    strategy,
    steps: [{ id: "step-1", toolId: "calculator_creator", verifier: "calculator_creator", executable: true }],
    sessionId: "multi-agent-test",
    traceId: "multi-agent-test"
  });
  assert(graph.roles.some((item) => item.role === "executor" && item.relatedSteps.includes("step-1")), "TeamPlanner should bind executable steps to executor");

  const decisionEngine = new DecisionEngine({ filePath: path.join(dir, "decisions.json") });
  const planner = new PlannerAgent({
    eventBus,
    strategyEngine,
    decisionEngine,
    agentManager: manager,
    teamPlanner,
    experienceStore: { query: () => [] },
    knowledgeRetriever: { retrieve: () => ({ similarTasks: 0, recommendedTools: [], recommendedSkills: [], experience: [], successRate: 0, matches: [] }) },
    reasoningEngine: { reason: (input) => ({ taskType: input.taskType, confidence: input.strategyResult?.confidence || 0, reason: "stub", agentTeam: input.agentTeam }) },
    metaLearningCenter: { getHints: () => ({ available: false }) },
    reflectionMemory: { getHints: () => ({ available: false }) },
    selfImprovementEngine: { getHints: () => ({ available: false }) },
    learningOrchestrator: { getHints: () => ({ available: false }) },
    knowledgeEvolutionNetwork: { getHints: () => ({ available: false }) },
    autonomousPlanner: { plan: () => ({ steps: [] }) }
  });
  const plan = planner.createPlan({
    text: "做一个计算器软件然后打开",
    primaryIntent: "dev.code.calculator",
    intents: [{ intent: "dev.code.calculator", clause: "calculator" }]
  }, { sessionId: "multi-agent-planner", traceId: "multi-agent-planner" });
  assert(plan.agentTeam, "Planner should expose selected agent team");
  assert(plan.teamTaskGraph, "Planner should expose team task graph");
  assert(plan.teamTaskGraph.roles.some((item) => item.role === "planner"), "Team graph should contain planner role");

  const trace = eventBus.getTrace("multi-agent-planner");
  assert(trace.teams.length >= 1, "AgentTrace should record team events");
  assert(trace.assignments.length >= 1, "AgentTrace should record task assignments");

  let orchestratorCalled = false;
  const dispatched = manager.dispatchTask({
    taskOrchestrator: {
      execute: async () => {
        orchestratorCalled = true;
        return { handled: true, normalized: { success: true }, toolId: "calculator_creator" };
      }
    },
    sessionId: "dispatch-test",
    message: "create calculator",
    planObject: plan,
    contextPatch: { traceId: "dispatch-test" }
  });
  return Promise.resolve(dispatched).then((dispatchResult) => {
    assert(orchestratorCalled, "AgentManager should dispatch task into TaskOrchestrator");
    assert(dispatchResult.agentManager?.dispatched, "Dispatch result should record AgentManager as dispatcher");

    return {
      ok: true,
      cases: [
        "agent_registry_registers_and_matches_agents",
        "strategy_engine_outputs_team_needs",
        "agent_manager_creates_team_assignments",
        "collaboration_protocol_records_handoffs",
        "team_planner_builds_role_task_graph",
        "planner_exposes_agent_team_and_team_graph",
        "agent_trace_records_organization_events",
        "agent_manager_dispatches_to_task_orchestrator"
      ]
    };
  });
}

if (require.main === module) Promise.resolve(run()).then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => {
  console.error(error);
  process.exit(1);
});

module.exports = { run };
