const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const { ReasoningEngine } = require("../services/reasoning/reasoning-engine");
const { DecisionEngine } = require("../services/reasoning/decision-engine");
const { StrategyEvaluator } = require("../services/reasoning/strategy-evaluator");
const { ReasoningMemory } = require("../services/reasoning/reasoning-memory");
const { KnowledgeCenter } = require("../services/knowledge/knowledge-center");
const { StrategyOptimizer } = require("../services/optimization/strategy-optimizer");

function root(name) {
  const dir = path.join("D:\\BaiQiuAI", "data", "reasoning-tests", `run-${process.pid}`, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function run() {
  const memoryRoot = root("memory");
  const reasoningMemory = new ReasoningMemory({ rootDir: memoryRoot });
  const engine = new ReasoningEngine({ reasoningMemory });
  const calculator = engine.reason({
    goal: "帮我写一个计算器软件放桌面，然后打开",
    taskType: "dev.code.calculator",
    knowledgeHints: {
      recommendedTools: ["calculator_creator", "browser_open"],
      successRate: 0.99,
      matches: [{ taskType: "dev.code.calculator", tools: ["calculator_creator", "browser_open"], successRate: 0.99 }]
    }
  });
  assert.strictEqual(calculator.selectedPlan.id, "calculator_direct", "calculator task should choose direct calculator strategy");
  assert.deepStrictEqual(calculator.selectedPlan.tools, ["calculator_creator", "browser_open"]);

  const decisionEngine = new DecisionEngine({ strategyEvaluator: new StrategyEvaluator() });
  const comparison = decisionEngine.decide({
    candidatePlans: [
      { id: "tool_b", tools: ["tool_b"], successRate: 0.5, toolStability: 0.5, avgDuration: 1000, riskLevel: "low" },
      { id: "tool_a", tools: ["tool_a"], successRate: 0.9, toolStability: 0.9, avgDuration: 1000, riskLevel: "low" }
    ]
  });
  assert.strictEqual(comparison.selectedStrategy.id, "tool_a", "higher success strategy should win");

  const historical = decisionEngine.decide({
    candidatePlans: [
      { id: "fast_low_success", tools: ["fast"], successRate: 0.4, toolStability: 0.4, avgDuration: 100, riskLevel: "low" },
      { id: "stable_history", tools: ["stable"], successRate: 0.95, toolStability: 0.95, avgDuration: 3000, riskLevel: "low" }
    ]
  });
  assert.strictEqual(historical.selectedStrategy.id, "stable_history", "historical success rate should affect decision");
  assert(historical.alternatives.some((item) => item.strategy.id === "fast_low_success" && item.score < historical.score));

  const failedRecord = reasoningMemory.recordDecision({
    taskType: "dev.code.calculator",
    selectedPlan: { id: "bad", tools: ["bad_tool"] },
    reason: "failed",
    success: false
  });
  assert.strictEqual(failedRecord, null, "failed decision should not be stored");
  assert.strictEqual(reasoningMemory.list().length, 0, "failed decision should not increase memory");

  const saved = reasoningMemory.recordDecision({
    taskType: "dev.code.calculator",
    selectedPlan: calculator.selectedPlan,
    reason: calculator.reason,
    success: true
  });
  assert(saved.id, "successful decision should be stored");
  const restored = new ReasoningMemory({ rootDir: memoryRoot });
  assert.strictEqual(restored.query({ taskType: "dev.code.calculator" }).length, 1, "ReasoningMemory should restore saved decisions");

  const knowledgeRoot = root("knowledge");
  const knowledgeCenter = new KnowledgeCenter({ rootDir: knowledgeRoot });
  knowledgeCenter.addKnowledge({
    type: "task",
    taskType: "dev.code.calculator",
    toolId: "calculator_creator",
    source: "calculator",
    successRate: 0.99
  });
  knowledgeCenter.addKnowledge({
    type: "task",
    taskType: "dev.code.calculator",
    toolId: "browser_open",
    source: "calculator open",
    successRate: 0.98
  });
  const historicalPlans = knowledgeCenter.queryHistoricalPlans({ taskType: "dev.code.calculator" });
  assert(historicalPlans.some((item) => item.tools.includes("calculator_creator") && item.tools.includes("browser_open")), "KnowledgeCenter should return historical tool combinations");

  const optimizer = new StrategyOptimizer({ minSamples: 10 });
  const reasoningWeight = optimizer.reasoningWeight({ toolId: "calculator_creator", reasoningResult: calculator });
  assert(reasoningWeight > 0, "StrategyOptimizer should read reasoning result as weight");
  assert.strictEqual(optimizer.reasoningWeight({ toolId: "write_xlsx", reasoningResult: calculator }), 0, "unselected tools should not get reasoning weight");

  return {
    ok: true,
    cases: [
      "calculator_strategy_selected",
      "multiple_tool_strategy_comparison",
      "historical_success_rate_affects_decision",
      "low_success_strategy_downgraded",
      "failed_decision_not_saved",
      "reasoning_memory_restore"
    ]
  };
}

if (require.main === module) console.log(JSON.stringify(run(), null, 2));

module.exports = { run };
