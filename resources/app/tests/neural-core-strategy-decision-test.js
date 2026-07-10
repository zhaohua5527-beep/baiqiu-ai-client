const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const { StrategyEngine } = require("../services/neural-core/strategy-engine");
const { DecisionEngine } = require("../services/neural-core/decision-engine");
const { ExperienceStore } = require("../services/neural-core/experience-store");
const { MemoryCenter } = require("../services/memory-center");
const { PlannerAgent } = require("../services/planner-agent");

function root(name) {
  const dir = path.join("D:\\BaiQiuAI", "data", "neural-core-tests", `run-${process.pid}`, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function run() {
  const rootDir = root("strategy");
  const experienceFile = path.join(rootDir, "experience.json");
  const decisionFile = path.join(rootDir, "decisions.json");
  const store = new ExperienceStore({ filePath: experienceFile });
  store.saveExperience({
    taskType: "dev.code.calculator",
    problem: "task completed",
    cause: "verified",
    solution: "reuse calculator creator",
    toolsUsed: ["calculator_creator", "browser_open"],
    successRate: 0.98,
    confidence: 0.92
  });
  const experiences = store.query({ taskType: "dev.code.calculator", problem: "calculator" });
  assert(experiences[0].relevance >= 0.7, "Experience query should compute relevance");
  const reloaded = store.load().items[0];
  assert.strictEqual(reloaded.usageCount, 1, "Experience query should increase usageCount");
  assert(reloaded.lastUsed, "Experience query should set lastUsed");

  const strategyEngine = new StrategyEngine();
  const strategy = strategyEngine.chooseStrategy({
    taskType: "dev.code.calculator",
    experiences,
    riskLevel: "low",
    goal: "create calculator"
  });
  assert.strictEqual(strategy.mode, "experience_preferred", "high success experience should choose experience_preferred");
  assert(strategy.recommendedTools.includes("calculator_creator"), "Strategy should recommend experienced tools");
  assert(strategy.confidence > 0.7, "Strategy should include confidence");

  const highRisk = strategyEngine.chooseStrategy({
    taskType: "system.shutdown",
    experiences,
    riskLevel: "high",
    goal: "shutdown"
  });
  assert.strictEqual(highRisk.mode, "permission_aware", "high risk task should choose permission-aware strategy");

  const decisionEngine = new DecisionEngine({ filePath: decisionFile });
  const decision = decisionEngine.decide({
    taskType: "dev.code.calculator",
    strategy,
    experiences: strategy.experiencesUsed,
    riskLevel: "low",
    goal: "create calculator"
  });
  assert(decision.decisionId, "Decision should be recorded");
  assert(decision.reason, "Decision should include reason");
  assert(decision.usedExperience.length >= 1, "Decision should include used experience");
  assert(decision.confidence > 0, "Decision should include confidence");
  assert(decisionEngine.recent(1)[0].decisionId === decision.decisionId, "Decision history should be persisted");

  const memory = new MemoryCenter({ root: rootDir });
  memory.recordExperience({
    taskType: "file.create",
    problem: "path not found",
    cause: "missing folder",
    solution: "create folder first",
    toolsUsed: ["file_creator"],
    successRate: 0.4,
    confidence: 0.8
  });
  const memoryExperiences = memory.queryExperience({ taskType: "file.create", problem: "path" });
  assert(memoryExperiences[0].relevance > 0, "MemoryCenter should score relevance");
  assert(memory.getExperienceMemory().items[0].usageCount === 1, "MemoryCenter should update usageCount");
  assert(memory.getExperienceMemory().items[0].lastUsed, "MemoryCenter should update lastUsed");

  const planner = new PlannerAgent({
    experienceStore: {
      query: () => experiences
    },
    strategyEngine,
    decisionEngine,
    knowledgeRetriever: { retrieve: () => ({ similarTasks: 0, recommendedTools: [], recommendedSkills: [], experience: [], successRate: 0, matches: [] }) },
    reasoningEngine: { reason: (input) => ({ taskType: input.taskType, selectedPlan: null, decision: { score: 0 }, confidence: 0, reason: "stub", strategyResult: input.strategyResult, strategyDecision: input.strategyDecision }) },
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
  }, { sessionId: "strategy-decision-test" });
  assert(plan.strategyResult, "Planner should expose strategyResult");
  assert(plan.strategyDecision, "Planner should expose strategyDecision");
  assert.strictEqual(plan.strategyResult.mode, "experience_preferred", "Planner should run Strategy Engine before planning");
  assert.strictEqual(plan.strategyDecision.decision, "experience_preferred", "Planner should run Decision Engine before planning");

  return {
    ok: true,
    cases: [
      "strategy_engine_selects_by_experience",
      "strategy_engine_handles_risk",
      "decision_engine_records_reason_experience_confidence",
      "experience_memory_scoring_usage_last_used",
      "planner_runs_experience_strategy_decision_before_plan"
    ]
  };
}

if (require.main === module) console.log(JSON.stringify(run(), null, 2));

module.exports = { run };
