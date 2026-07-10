const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const { MetaLearningCenter } = require("../services/meta-learning/meta-learning-center");
const { PolicyOptimizer } = require("../services/meta-learning/policy-optimizer");
const { StrategyAnalyzer } = require("../services/meta-learning/strategy-analyzer");
const { PlannerAgent } = require("../services/planner-agent");

function root(name) {
  const dir = path.join("D:\\BaiQiuAI", "data", "meta-learning-tests", `run-${process.pid}`, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function run() {
  const metaRoot = root("meta");
  const metaLearningCenter = new MetaLearningCenter({ rootDir: metaRoot });
  const calculatorStrategy = {
    id: "calculator_direct",
    tools: ["calculator_creator", "browser_open"]
  };
  for (let i = 0; i < 10; i += 1) {
    metaLearningCenter.recordLearning({
      taskType: "dev.code.calculator",
      strategy: calculatorStrategy,
      success: true,
      verified: true,
      verificationStatus: "passed",
      successRate: 1,
      avgDuration: 1000
    });
  }
  const calculatorHints = metaLearningCenter.getHints({ taskType: "dev.code.calculator" });
  assert.strictEqual(calculatorHints.recommendation, "calculator_direct", "successful calculator strategy should be recommended");
  assert(calculatorHints.weight >= 10, "successful strategy weight should increase");

  const optimizer = new PolicyOptimizer({ metaLearningCenter });
  const badPathStrategy = { id: "bad_path", tools: ["browser_open"] };
  for (let i = 0; i < 10; i += 1) {
    optimizer.recordOutcome({
      taskType: "system.open",
      strategy: badPathStrategy,
      success: false,
      errorType: "invalid_path",
      reason: "invalid path"
    });
  }
  const badPathHints = metaLearningCenter.getHints({ taskType: "system.open" });
  const badPath = Object.values(metaLearningCenter.loadStrategies().strategies).find((item) => item.strategyId === "bad_path");
  assert(badPath.weight <= -10, "failed strategy should be downgraded");
  assert.strictEqual(badPath.status, "deprecated", "continuous failure should deprecate strategy");
  assert(!badPathHints.strategies.some((item) => item.strategyId === "bad_path"), "deprecated strategy should not be active recommendation");

  const planner = new PlannerAgent({ metaLearningCenter });
  const shutdownPlan = planner.createPlan({
    text: "关闭电脑",
    primaryIntent: "system.shutdown",
    intents: [{ intent: "system.shutdown", clause: "关闭电脑" }],
    isMultiStep: true
  }, { sessionId: "meta-learning-test" });
  assert.strictEqual(shutdownPlan.steps[0].toolId, "system_shutdown");
  assert.strictEqual(shutdownPlan.steps[0].needUserConfirm, true, "meta learning must not bypass high risk confirmation");
  assert(shutdownPlan.metaHints, "Planner should expose metaHints");

  const fatal = metaLearningCenter.recordLearning({
    taskType: "file.create",
    strategy: { id: "fatal_strategy", tools: ["file_creator"] },
    success: true,
    verified: true,
    verificationStatus: "passed",
    errorType: "fatal"
  });
  const permission = metaLearningCenter.recordLearning({
    taskType: "system.shutdown",
    strategy: { id: "permission_strategy", tools: ["system_shutdown"] },
    success: true,
    verified: true,
    verificationStatus: "passed",
    errorType: "permission"
  });
  assert.strictEqual(fatal, null, "fatal failures must not enter learning data");
  assert.strictEqual(permission, null, "permission failures must not enter learning data");
  const strategies = metaLearningCenter.loadStrategies().strategies;
  assert(!Object.values(strategies).some((item) => item.strategyId === "fatal_strategy"));
  assert(!Object.values(strategies).some((item) => item.strategyId === "permission_strategy"));

  const analyzer = new StrategyAnalyzer({
    performanceTracker: { list: () => [{ taskType: "dev.code.calculator", toolId: "calculator_creator", successRate: 0.98, avgDuration: 1200 }] },
    experienceCenter: { list: () => [{ taskType: "dev.code.calculator", success: true }] },
    knowledgeCenter: { queryHistoricalPlans: () => [{ taskType: "dev.code.calculator", tools: ["calculator_creator", "browser_open"], successRate: 0.98 }] },
    reasoningMemory: { query: () => [{ taskType: "dev.code.calculator", selectedPlan: { tools: ["calculator_creator", "browser_open"], successRate: 0.99 } }] }
  });
  const analysis = analyzer.analyze({ taskType: "dev.code.calculator" });
  assert.strictEqual(analysis.recommendation.id, "calculator_creator+browser_open", "analyzer should recommend highest success strategy");
  assert.strictEqual(analysis.recoveryCount, 1, "analyzer should count successful recovery experiences");

  assert(fs.existsSync(path.join(metaRoot, "learning.json")));
  assert(fs.existsSync(path.join(metaRoot, "strategies.json")));
  assert(fs.existsSync(path.join(metaRoot, "policy-history.json")));

  return {
    ok: true,
    cases: [
      "successful_learning_increases_weight",
      "failed_strategy_downgrades",
      "high_risk_permission_not_bypassed",
      "fatal_permission_data_isolated",
      "strategy_analyzer_recommends_best"
    ]
  };
}

if (require.main === module) console.log(JSON.stringify(run(), null, 2));

module.exports = { run };
