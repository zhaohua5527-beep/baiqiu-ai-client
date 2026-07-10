const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const { AgentEventBus, AGENT_EVENTS } = require("../services/neural-core/agent-event-bus");
const { ExperienceStore } = require("../services/neural-core/experience-store");
const { ReflectionEngine } = require("../services/neural-core/reflection-engine");
const { MemoryCenter } = require("../services/memory-center");
const { PlannerAgent } = require("../services/planner-agent");

function root(name) {
  const dir = path.join("D:\\BaiQiuAI", "data", "neural-core-tests", `run-${process.pid}`, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function run() {
  const rootDir = root("reflection");
  const experienceFile = path.join(rootDir, "experience.json");
  const store = new ExperienceStore({ filePath: experienceFile });
  const bus = new AgentEventBus({ reflectionEngine: null });
  const reflection = new ReflectionEngine({ eventBus: bus, experienceStore: store });
  assert(reflection, "reflection engine should attach to event bus");

  const sessionId = "reflection-session";
  const traceId = "reflection-trace";
  bus.publish(AGENT_EVENTS.INTENT_DETECTED, { sessionId, traceId, intent: "dev.code.calculator", goal: "create calculator" });
  bus.publish(AGENT_EVENTS.PLAN_CREATED, { sessionId, traceId, plan: { id: "plan-1" } });
  bus.publish(AGENT_EVENTS.TOOL_SELECTED, { sessionId, traceId, toolId: "calculator_creator" });
  bus.publish(AGENT_EVENTS.TOOL_EXECUTING, { sessionId, traceId, toolId: "calculator_creator" });
  bus.publish(AGENT_EVENTS.TOOL_RESULT, { sessionId, traceId, toolId: "calculator_creator", success: true });
  bus.publish(AGENT_EVENTS.VERIFICATION_DONE, { sessionId, traceId, status: "passed", verification: { status: "passed" } });
  bus.publish(AGENT_EVENTS.TASK_COMPLETED, { sessionId, traceId, intent: "dev.code.calculator" });
  const successItems = store.query({ taskType: "dev.code.calculator" });
  assert(successItems.length >= 1, "completed task should save experience");
  assert.strictEqual(successItems[0].problem, "task completed", "success experience should summarize completion");
  assert(successItems[0].toolsUsed.includes("calculator_creator"), "experience should include toolsUsed");
  assert(successItems[0].confidence > 0, "experience should include confidence");

  const failedTrace = "reflection-failed";
  bus.publish(AGENT_EVENTS.INTENT_DETECTED, { sessionId, traceId: failedTrace, intent: "file.create", goal: "create file" });
  bus.publish(AGENT_EVENTS.TOOL_SELECTED, { sessionId, traceId: failedTrace, toolId: "file_creator" });
  bus.publish(AGENT_EVENTS.TOOL_RESULT, { sessionId, traceId: failedTrace, toolId: "file_creator", success: false, error: "path not found" });
  bus.publish(AGENT_EVENTS.VERIFICATION_DONE, { sessionId, traceId: failedTrace, status: "failed", reason: "path not found" });
  const failedItems = store.query({ taskType: "file.create", problem: "path" });
  assert(failedItems.length >= 1, "failed verification should save experience");
  assert(/path|resource/i.test(failedItems[0].cause), "failed experience should analyze cause");
  assert(/workspace|missing/i.test(failedItems[0].solution), "failed experience should suggest solution");

  const memory = new MemoryCenter({ root: rootDir, eventBus: bus });
  memory.setUserMemory({ name: "测试用户" });
  memory.setProjectState({ projectName: "白球AI" });
  memory.recordExperience({
    taskType: "dev.code.calculator",
    problem: "task completed",
    cause: "verified",
    solution: "reuse verified plan",
    toolsUsed: ["calculator_creator"],
    successRate: 1,
    confidence: 0.9
  });
  assert(memory.getUser().name === "测试用户", "User Memory should remain separate");
  assert(memory.getProjectState().projectName === "白球AI", "Project Memory should remain separate");
  assert(memory.getExperienceMemory().items.length >= 1, "Experience Memory should be stored separately");

  const planner = new PlannerAgent({
    experienceStore: {
      query: () => [
        {
          taskType: "dev.code.calculator",
          problem: "task completed",
          cause: "verified",
          solution: "reuse verified plan",
          toolsUsed: ["calculator_creator"],
          successRate: 1,
          confidence: 0.9
        }
      ]
    },
    knowledgeRetriever: { retrieve: () => ({ similarTasks: 0, recommendedTools: [], recommendedSkills: [], experience: [], successRate: 0, matches: [] }) },
    reasoningEngine: { reason: (input) => ({ taskType: input.taskType, selectedPlan: null, decision: { score: 0 }, confidence: 0, reason: "stub", historicalExperience: input.historicalExperience }) },
    metaLearningCenter: { getHints: () => ({ available: false }) },
    reflectionMemory: { getHints: () => ({ available: false }) },
    selfImprovementEngine: { getHints: () => ({ available: false }) },
    learningOrchestrator: { getHints: () => ({ available: false }) },
    knowledgeEvolutionNetwork: { getHints: () => ({ available: false }) },
    autonomousPlanner: { plan: () => ({ steps: [] }) }
  });
  const plan = planner.createPlan({
    text: "create calculator",
    primaryIntent: "dev.code.calculator",
    intents: [{ intent: "dev.code.calculator", clause: "create calculator" }]
  }, { sessionId: "planner-experience-test" });
  assert(plan.experienceMemoryHints.length === 1, "Planner should query related Experience Memory before planning");

  return {
    ok: true,
    cases: [
      "reflection_listens_task_completed",
      "reflection_listens_task_failed_verification",
      "experience_memory_structure",
      "memory_center_separates_user_project_experience",
      "planner_queries_experience_before_task"
    ]
  };
}

if (require.main === module) console.log(JSON.stringify(run(), null, 2));

module.exports = { run };
