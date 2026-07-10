const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const { GoalAnalyzer } = require("../services/planning/goal-analyzer");
const { AutonomousPlanner } = require("../services/planning/autonomous-planner");
const { PlanEvaluator } = require("../services/planning/plan-evaluator");
const { PlannerAgent } = require("../services/planner-agent");

function root(name) {
  const dir = path.join("D:\\BaiQiuAI", "data", "autonomous-planning-tests", `run-${process.pid}`, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function run() {
  const planningRoot = root("planning");
  const planner = new AutonomousPlanner({ rootDir: planningRoot });
  const calculator = planner.plan({ text: "做一个计算器软件然后打开" });
  assert.strictEqual(calculator.goal, "create calculator application");
  assert(calculator.requirements.includes("generate app"));
  assert(calculator.requirements.includes("open application"));
  assert.deepStrictEqual(calculator.steps.map((step) => step.toolId), ["calculator_creator", "browser_open"]);
  assert(calculator.confidence > 0.7, "calculator autonomous plan should have useful confidence");

  const folder = planner.plan({ text: "创建文件夹，里面三个文件，然后打开" });
  assert.strictEqual(folder.steps.length, 5, "folder task should generate dynamic task graph");
  assert.strictEqual(folder.steps[0].toolId, "create_folder");
  assert.strictEqual(folder.steps.filter((step) => step.toolId === "file_creator").length, 3);
  assert(folder.steps[4].dependsOn.includes(folder.steps[0].id), "open step should depend on folder");

  const evaluator = new PlanEvaluator({
    performanceTracker: {
      get(toolId) {
        if (toolId === "tool_a") return { successRate: 0.95, sampleCount: 20 };
        if (toolId === "tool_b") return { successRate: 0.5, sampleCount: 20 };
        return null;
      }
    }
  });
  const best = evaluator.chooseBest([
    { taskType: "test", steps: [{ toolId: "tool_b" }] },
    { taskType: "test", steps: [{ toolId: "tool_a" }] }
  ]);
  assert.strictEqual(best.plan.steps[0].toolId, "tool_a", "higher success tool should be selected");
  const optimized = evaluator.optimizeSteps([
    { toolId: "calculator_creator", target: "calculator" },
    { toolId: "browser_open", target: "calculator" }
  ], { calculatorCreatorHandlesOpen: true });
  assert.strictEqual(optimized.length, 1, "evaluator should support redundant browser_open removal");

  const agent = new PlannerAgent();
  const shutdown = agent.createPlan({
    text: "关闭电脑",
    primaryIntent: "system.shutdown",
    intents: [{ intent: "system.shutdown", clause: "关闭电脑" }],
    isMultiStep: true
  }, { sessionId: "autonomous-planning-test" });
  assert.strictEqual(shutdown.steps[0].toolId, "system_shutdown");
  assert.strictEqual(shutdown.steps[0].needUserConfirm, true, "high risk task must still require confirmation");
  assert(shutdown.autonomousPlan, "Planner should expose autonomousPlan");

  const fallbackAgent = new PlannerAgent({
    autonomousPlanner: {
      plan() {
        throw new Error("boom");
      }
    }
  });
  const fallback = fallbackAgent.createPlan({
    text: "做一个计算器软件然后打开",
    primaryIntent: "dev.code.calculator",
    intents: [{ intent: "dev.code.calculator", clause: "做一个计算器软件然后打开" }],
    isMultiStep: true
  }, { sessionId: "autonomous-fallback-test" });
  assert.strictEqual(fallback.steps.length, 2, "legacy planner should take over when AutonomousPlanner fails");
  assert.strictEqual(fallback.autonomousPlan.fallback, true);

  const goal = new GoalAnalyzer().analyze("帮我做一个计算器软件");
  assert.strictEqual(goal.goal, "create calculator application");
  assert(goal.requirements.includes("save file"));

  assert(fs.existsSync(path.join(planningRoot, "plans.json")));
  assert(fs.existsSync(path.join(planningRoot, "plan-evaluations.json")));

  return {
    ok: true,
    cases: [
      "calculator_best_plan",
      "folder_dynamic_task_graph",
      "strategy_selects_higher_success",
      "shutdown_requires_confirmation",
      "autonomous_fallback_to_legacy"
    ]
  };
}

if (require.main === module) console.log(JSON.stringify(run(), null, 2));

module.exports = { run };
