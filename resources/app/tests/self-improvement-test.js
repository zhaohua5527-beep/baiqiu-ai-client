const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const { SelfImprovementEngine } = require("../services/self-improvement/self-improvement-engine");
const { ImprovementAnalyzer } = require("../services/self-improvement/improvement-analyzer");
const { ImprovementPlanner } = require("../services/self-improvement/improvement-planner");
const { ImprovementEvaluator } = require("../services/self-improvement/improvement-evaluator");
const { ImprovementMemory } = require("../services/self-improvement/improvement-memory");
const { PlannerAgent } = require("../services/planner-agent");

function root(name) {
  const dir = path.join("D:\\BaiQiuAI", "data", "self-improvement-tests", `run-${process.pid}`, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function sourceText() {
  const dirs = [
    path.join(__dirname, "..", "services", "self-improvement"),
    path.join(__dirname, "..", "services")
  ];
  return [
    ...fs.readdirSync(dirs[0]).filter((file) => file.endsWith(".js")).map((file) => fs.readFileSync(path.join(dirs[0], file), "utf8")),
    fs.readFileSync(path.join(dirs[1], "planner-agent.js"), "utf8")
  ].join("\n");
}

function makeAnalyzer(rootDir) {
  return new ImprovementAnalyzer({
    rootDir,
    reflectionMemory: {
      loadReflections: () => ({
        reflections: [
          { taskType: "dev.code.calculator", mistake: "planning", reason: "missing dependsOn", improvement: "review planning dependencies" },
          { taskType: "dev.code.calculator", mistake: "context", reason: "context too broad", improvement: "narrow context" }
        ]
      })
    },
    experienceCenter: {
      list: () => [
        { taskType: "dev.code.calculator", toolId: "browser_open", errorType: "browser_missing", failedReason: "Edge missing", solution: "open_path", success: true },
        { taskType: "dev.code.calculator", toolId: "browser_open", errorType: "browser_missing", failedReason: "Edge missing", solution: "open_path", success: true },
        { taskType: "dev.code.calculator", toolId: "calculator_creator", errorType: "invalid_path", failedReason: "unsafe path", success: false }
      ]
    },
    performanceTracker: {
      list: () => [
        { taskType: "dev.code.calculator", toolId: "browser_open", successRate: 0.55, sampleCount: 20, avgDuration: 7000, failCount: 9, successCount: 11 }
      ]
    },
    knowledgeCenter: {
      queryKnowledge: () => [
        { taskType: "dev.code.calculator", toolId: "calculator_creator", successRate: 0.99 }
      ]
    },
    selfAwarenessMemory: {
      query: () => [
        { taskType: "dev.code.calculator", limitations: [{ type: "missing_capability", detail: "weather.query" }] }
      ]
    }
  });
}

function run() {
  const rootDir = root("improvement");
  const analyzer = makeAnalyzer(rootDir);
  const planner = new ImprovementPlanner({ rootDir });
  const evaluator = new ImprovementEvaluator({ rootDir });
  const improvementMemory = new ImprovementMemory({ rootDir });
  const engine = new SelfImprovementEngine({
    rootDir,
    analyzer,
    planner,
    evaluator,
    improvementMemory,
    selfAwarenessManager: { assessSelf: () => ({ summary: "state=goal_focused" }) },
    strategyManager: { analyzeStrategy: () => ({ analysis: { score: 0.8 } }) },
    decisionManager: { analyzeDecision: () => ({ decision: { score: 0.75 } }) },
    goalIntelligenceManager: { analyzeGoal: () => ({ score: 0.85 }) }
  });

  const success = engine.generateImprovementHints({
    input: "create calculator",
    taskType: "dev.code.calculator",
    executionResult: { success: true },
    before: { successRate: 0.8, avgDuration: 8000, failCount: 4, recoveryCount: 1 },
    after: { successRate: 0.9, avgDuration: 5000, failCount: 2, recoveryCount: 2 }
  });
  assert(success.memory.improvementId, "successful task should record improvement data");
  assert(success.evaluation.successRateChange > 0, "success rate change should be evaluated");
  assert.strictEqual(success.safety.modifiesPermission, false, "self improvement must not modify permission");

  const failed = engine.generateImprovementHints({
    input: "create calculator failed",
    taskType: "dev.code.calculator",
    executionResult: { success: false, error: "browser_missing" }
  });
  assert(failed.improvementHints.available, "failed task should generate improvement suggestions");
  assert(failed.improvementHints.strategyImprove.some((item) => item.type === "failure_pattern"), "failure pattern should create strategy improvement");
  assert(failed.improvementHints.planningImprove.length >= 1, "reflection planning data should enter analysis");
  assert(failed.improvementHints.toolSelectionImprove.some((item) => item.target === "browser_open"), "experience/performance should affect tool selection advice");
  assert(failed.improvementHints.memoryImprove.length >= 1, "context/self awareness data should affect memory advice");

  const history = improvementMemory.loadHistory().items;
  assert(history.length >= 2, "improvement history should be saved");
  const storedHints = improvementMemory.getHints({ taskType: "dev.code.calculator" });
  assert(storedHints.available, "stored improvement hints should be readable");

  const plannerAgent = new PlannerAgent({
    selfImprovementEngine: {
      getHints: () => ({ available: true, hints: [{ type: "planning_issue", suggestion: "test hint" }] })
    },
    knowledgeRetriever: { retrieve: () => ({ similarTasks: 0, recommendedTools: [], recommendedSkills: [], experience: [], successRate: 0, matches: [] }) },
    reasoningEngine: { reason: () => ({ taskType: "dev.code.calculator", selectedPlan: null, decision: { score: 0 }, confidence: 0, reason: "stub" }) },
    metaLearningCenter: { getHints: () => ({ available: false }) },
    reflectionMemory: { getHints: () => ({ available: false }) },
    autonomousPlanner: { plan: () => ({ steps: [] }) }
  });
  const plan = plannerAgent.createPlan({
    text: "create calculator",
    primaryIntent: "dev.code.calculator",
    intents: [{ intent: "dev.code.calculator", clause: "create calculator" }]
  }, { sessionId: "self-improvement-test" });
  assert(plan.improvementHints.available, "PlannerAgent should expose improvementHints");

  const src = sourceText();
  assert(!src.includes("ToolExecutionService.execute"), "self improvement must not call ToolExecutionService");
  assert(!src.includes("ToolSelector.execute"), "self improvement must not bypass ToolSelector");
  assert(!src.includes("VerifierCenter.verify"), "self improvement must not bypass VerifierCenter");
  assert(!src.includes("allowAll"), "self improvement must not loosen permission");

  for (const file of [
    "self-improvement-engine.json",
    "improvement-analysis.json",
    "improvement-plan.json",
    "improvement-evaluation.json",
    "improvements.json",
    "improvement-history.json"
  ]) {
    assert(fs.existsSync(path.join(rootDir, file)), `${file} should exist`);
  }

  return {
    ok: true,
    cases: [
      "success_task_records_improvement",
      "failed_task_generates_suggestions",
      "reflection_data_enters_analysis",
      "experience_data_enters_analysis",
      "performance_data_affects_evaluation",
      "planner_improvement_hints",
      "no_permission_change",
      "no_toolselector_or_verifier_bypass"
    ]
  };
}

if (require.main === module) console.log(JSON.stringify(run(), null, 2));

module.exports = { run };
