const assert = require("node:assert");
const { AgentStateManager, AGENT_STATES, normalizeState } = require("../services/agent_state_manager");
const { PlannerAgent } = require("../services/planner-agent");

function run() {
  const stateManager = new AgentStateManager();
  const sessionId = `neural-core-${process.pid}`;
  const started = stateManager.start(sessionId, {
    taskId: "task-1",
    userMessage: "做一个计算器软件然后打开",
    userIntent: "dev.code.calculator"
  });
  assert.strictEqual(started.state, AGENT_STATES.UNDERSTANDING, "start should enter UNDERSTANDING");
  assert.strictEqual(started.taskContext.taskId, "task-1", "taskContext should keep taskId");
  assert.strictEqual(started.taskContext.userIntent, "dev.code.calculator", "taskContext should keep userIntent");
  assert.strictEqual(started.taskContext.goal, "做一个计算器软件然后打开", "taskContext should keep goal");

  assert.strictEqual(normalizeState("tool_selected"), AGENT_STATES.SELECTING_TOOL, "legacy tool_selected maps to SELECTING_TOOL");
  assert.strictEqual(normalizeState("validating"), AGENT_STATES.VERIFYING, "legacy validating maps to VERIFYING");

  stateManager.recordToolSelection(sessionId, { toolId: "calculator_creator", logicalTool: "html_app_creator" });
  stateManager.recordExecution(sessionId, { taskId: "task-1", toolId: "calculator_creator", success: true, status: "success" });
  stateManager.recordVerification(sessionId, { status: "passed" });
  stateManager.recordLearning(sessionId, { type: "memory_update", field: "project" });
  const snapshot = stateManager.complete(sessionId);
  assert.strictEqual(snapshot.state, AGENT_STATES.COMPLETED, "complete should enter COMPLETED");
  assert(snapshot.taskContext.tools.some((tool) => tool.toolId === "calculator_creator"), "taskContext should keep tools");
  assert(snapshot.taskContext.executionHistory.some((item) => item.toolId === "calculator_creator"), "taskContext should keep executionHistory");
  assert(snapshot.taskContext.memoryUpdates.length === 1, "taskContext should keep memoryUpdates");

  const planner = new PlannerAgent({
    stateManager,
    knowledgeRetriever: { retrieve: () => ({ similarTasks: 0, recommendedTools: [], recommendedSkills: [], experience: [], successRate: 0, matches: [] }) },
    reasoningEngine: { reason: () => ({ taskType: "dev.code.calculator", selectedPlan: null, decision: { score: 0 }, confidence: 0, reason: "stub" }) },
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
    intents: [{ intent: "dev.code.calculator", clause: "做一个计算器软件然后打开" }]
  }, { sessionId });
  const planned = stateManager.snapshot(sessionId);
  assert(plan.tasks.length > 0, "Planner should still create tasks");
  assert.strictEqual(planned.state, AGENT_STATES.PLANNING, "Planner should route through PLANNING state");
  assert(planned.taskContext.plan, "Planner should bind plan into taskContext");

  return {
    ok: true,
    cases: [
      "state_machine_created",
      "legacy_state_mapping",
      "task_context_standard_fields",
      "tool_execution_verification_learning_records",
      "planner_routes_through_state_manager"
    ]
  };
}

if (require.main === module) console.log(JSON.stringify(run(), null, 2));

module.exports = { run };
