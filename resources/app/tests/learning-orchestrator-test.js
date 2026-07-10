const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const { LearningOrchestrator } = require("../services/learning/learning-orchestrator");
const { LearningScheduler } = require("../services/learning/learning-scheduler");
const { LearningPriorityEngine } = require("../services/learning/learning-priority-engine");
const { LearningEvaluator } = require("../services/learning/learning-evaluator");
const { PlannerAgent } = require("../services/planner-agent");

function root(name) {
  const dir = path.join("D:\\BaiQiuAI", "data", "learning-tests", `run-${process.pid}`, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function sourceText() {
  const dirs = [
    path.join(__dirname, "..", "services", "learning"),
    path.join(__dirname, "..", "services")
  ];
  return [
    ...fs.readdirSync(dirs[0]).filter((file) => file.endsWith(".js")).map((file) => fs.readFileSync(path.join(dirs[0], file), "utf8")),
    fs.readFileSync(path.join(dirs[1], "planner-agent.js"), "utf8")
  ].join("\n");
}

function makeOrchestrator(rootDir) {
  return new LearningOrchestrator({
    rootDir,
    experienceCenter: {
      list: () => [
        { taskType: "dev.code.calculator", toolId: "browser_open", errorType: "browser_missing", solution: "open_path", success: true },
        { taskType: "dev.code.calculator", toolId: "calculator_creator", errorType: "invalid_path", solution: "use_workspace", success: true }
      ]
    },
    knowledgeCenter: {
      queryKnowledge: () => [
        { taskType: "dev.code.calculator", toolId: "calculator_creator", successRate: 0.99 },
        { taskType: "dev.code.calculator", toolId: "browser_open", successRate: 0.8 }
      ]
    },
    reflectionMemory: {
      loadReflections: () => ({
        reflections: [
          { taskType: "dev.code.calculator", status: "failed", reason: "missing dependency", improvement: "add dependsOn" }
        ]
      })
    },
    reflectionEngine: { reflect: () => ({ status: "success" }) },
    metaLearningCenter: { getHints: () => ({ available: true, recommendation: "calculator_creator+browser_open" }) },
    selfImprovementEngine: { getHints: () => ({ available: true, hints: [{ type: "planning", suggestion: "prefer verified sequence" }] }) },
    evolutionEngine: { generateEvolutionAdvice: () => ({ recommendations: [{ type: "capability", suggestion: "keep calculator strategy" }] }) },
    performanceTracker: {
      list: () => [
        { taskType: "dev.code.calculator", toolId: "calculator_creator", successCount: 7, failCount: 3, sampleCount: 10, successRate: 0.7, avgDuration: 9000 },
        { taskType: "dev.code.calculator", toolId: "browser_open", successCount: 6, failCount: 4, sampleCount: 10, successRate: 0.6, avgDuration: 8000 }
      ]
    }
  });
}

function run() {
  const rootDir = root("learning");
  const priority = new LearningPriorityEngine({ rootDir });
  const high = priority.calculate({ failureCount: 5, successRateDrop: 0.2, usageFrequency: 40, taskImportance: 0.9 });
  const low = priority.calculate({ failureCount: 0, successRateDrop: 0, usageFrequency: 1, taskImportance: 0.1 });
  assert(high.score > low.score, "priority should rise with failures, drop, usage and importance");

  const scheduler = new LearningScheduler({ rootDir, priorityEngine: priority });
  const scheduled = scheduler.schedule({
    taskType: "dev.code.calculator",
    signals: { periodic: true, failureRate: 0.35, failureCount: 7, performanceDrop: 1200, newSkill: true, usageFrequency: 20 }
  });
  assert(scheduled.some((task) => task.type === "periodic_review"), "scheduler should support periodic learning");
  assert(scheduled.some((task) => task.type === "failure_rate_review"), "scheduler should trigger on failure rate");
  assert(scheduled.some((task) => task.type === "performance_decline_review"), "scheduler should trigger on performance decline");
  assert(scheduled.some((task) => task.type === "new_skill_review"), "scheduler should trigger on new skill");

  const evaluator = new LearningEvaluator({ rootDir });
  const evalResult = evaluator.evaluate({
    before: { successRate: 0.7, avgDuration: 9000, recoveryCount: 1 },
    after: { successRate: 0.9, avgDuration: 5000, recoveryCount: 3 }
  });
  assert(evalResult.successRateChange > 0, "evaluator should compare success rate");
  assert(evalResult.avgDurationChange < 0, "evaluator should compare average duration");
  assert(evalResult.recoveryChange > 0, "evaluator should compare recovery count");

  const orchestrator = makeOrchestrator(rootDir);
  const planResult = orchestrator.buildLearningPlan({
    taskType: "dev.code.calculator",
    previousSuccessRate: 0.95,
    previousAvgDuration: 5000,
    newSkill: true,
    taskImportance: 0.9,
    before: { successRate: 0.6, avgDuration: 9000, recoveryCount: 1 },
    after: { successRate: 0.8, avgDuration: 7000, recoveryCount: 2 }
  });
  assert(planResult.learningPlan.learningPlanId, "orchestrator should create learningPlan");
  assert(planResult.learningTasks.length >= 2, "orchestrator should create learningTasks from signals");
  assert(planResult.learningHints.some((hint) => hint.type === "failure_learning"), "failure data should produce learning hint");
  assert(planResult.learningHints.some((hint) => hint.type === "reflection_learning"), "reflection data should enter learning");
  assert(planResult.learningHints.some((hint) => hint.type === "experience_learning"), "experience data should enter learning");
  assert.strictEqual(planResult.safety.executesTool, false, "learning must not execute tools");
  assert.strictEqual(planResult.safety.modifiesPermission, false, "learning must not modify permission");

  const plannerAgent = new PlannerAgent({
    learningOrchestrator: {
      getHints: () => ({ available: true, hints: [{ type: "failure_learning", suggestion: "test learning hint" }] })
    },
    selfImprovementEngine: { getHints: () => ({ available: false, hints: [] }) },
    knowledgeRetriever: { retrieve: () => ({ similarTasks: 0, recommendedTools: [], recommendedSkills: [], experience: [], successRate: 0, matches: [] }) },
    reasoningEngine: { reason: () => ({ taskType: "dev.code.calculator", selectedPlan: null, decision: { score: 0 }, confidence: 0, reason: "stub" }) },
    metaLearningCenter: { getHints: () => ({ available: false }) },
    reflectionMemory: { getHints: () => ({ available: false }) },
    autonomousPlanner: { plan: () => ({ steps: [] }) }
  });
  const plannerResult = plannerAgent.createPlan({
    text: "create calculator",
    primaryIntent: "dev.code.calculator",
    intents: [{ intent: "dev.code.calculator", clause: "create calculator" }]
  }, { sessionId: "learning-test" });
  assert(plannerResult.learningHints.available, "PlannerAgent should expose learningHints");

  for (const file of ["learning-plan.json", "learning-tasks.json", "learning-history.json", "learning-results.json"]) {
    assert(fs.existsSync(path.join(rootDir, file)), `${file} should exist`);
  }

  const src = sourceText();
  assert(!src.includes("ToolExecutionService.execute"), "learning layer must not call ToolExecutionService");
  assert(!src.includes("ToolSelector.execute"), "learning layer must not bypass ToolSelector");
  assert(!src.includes("VerifierCenter.verify"), "learning layer must not bypass VerifierCenter");
  assert(!src.includes("allowAll"), "learning layer must not loosen permissions");

  return {
    ok: true,
    cases: [
      "learning_plan_created",
      "scheduled_periodic_learning",
      "scheduled_failure_learning",
      "scheduled_performance_learning",
      "scheduled_skill_learning",
      "priority_calculated",
      "evaluation_compares_metrics",
      "planner_learning_hints",
      "no_permission_change",
      "no_toolselector_or_verifier_bypass"
    ]
  };
}

if (require.main === module) console.log(JSON.stringify(run(), null, 2));

module.exports = { run };
