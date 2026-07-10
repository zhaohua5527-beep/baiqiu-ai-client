const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const { StrategyManager } = require("../services/strategy-intelligence/strategy-manager");
const { StrategyEngine } = require("../services/strategy-intelligence/strategy-engine");
const { StrategyPlanner } = require("../services/strategy-intelligence/strategy-planner");
const { StrategyEvaluator } = require("../services/strategy-intelligence/strategy-evaluator");
const { StrategyMemory } = require("../services/strategy-intelligence/strategy-memory");

function root(name) {
  const dir = path.join("D:\\BaiQiuAI", "data", "strategy-intelligence-tests", `run-${process.pid}`, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function sourceText() {
  const dir = path.join(__dirname, "..", "services", "strategy-intelligence");
  return fs.readdirSync(dir)
    .filter((file) => file.endsWith(".js"))
    .map((file) => fs.readFileSync(path.join(dir, file), "utf8"))
    .join("\n");
}

function run() {
  const rootDir = root("strategy");
  const strategyPlanner = new StrategyPlanner({ rootDir });
  const evaluator = new StrategyEvaluator({ rootDir });
  const strategyEngine = new StrategyEngine({ rootDir, evaluator });
  const strategyMemory = new StrategyMemory({ rootDir });
  const manager = new StrategyManager({
    rootDir,
    strategyPlanner,
    evaluator,
    strategyEngine,
    strategyMemory,
    decisionManager: {
      analyzeDecision: () => ({
        decision: {
          score: 1.05,
          selectedOption: {
            sourceType: "reasoning",
            action: "select_strategy",
            taskType: "dev.code.calculator",
            content: "calculator direct decision",
            confidence: 0.92,
            riskLevel: "low"
          }
        }
      })
    },
    attentionManager: {
      focus: () => ({
        selection: {
          selected: [
            { source: "AttentionManager", taskType: "dev.code.calculator", content: "focus calculator", confidence: 0.9, attentionScore: 1.1 }
          ]
        }
      })
    },
    contextManager: {
      buildContext: () => ({
        items: [
          { source: "ContextManager", taskType: "dev.code.calculator", content: "calculator context", priorityScore: 0.88 }
        ]
      })
    },
    memoryCore: {
      retrieve: () => ({
        memories: [
          { taskType: "dev.code.calculator", content: "calculator memory", retrievalScore: 0.86 }
        ]
      })
    },
    goalManager: {
      listGoals: () => [
        { taskType: "dev.code.calculator", goal: "create calculator", status: "active", confidence: 0.9, riskLevel: "low" }
      ]
    },
    reasoningEngine: {
      reason: () => ({
        taskType: "dev.code.calculator",
        selectedPlan: { id: "calculator_direct", tools: ["calculator_creator", "browser_open"] },
        confidence: 0.94,
        reason: "selected calculator_direct"
      })
    },
    reflectionMemory: {
      getHints: () => ({ available: true, suggestion: "avoid redundant open", confidence: 0.82 })
    },
    evolutionEngine: {
      generateEvolutionAdvice: () => ({
        recommendations: [
          { type: "strategy", target: "calculator", suggestion: "keep direct calculator strategy", confidence: 0.72 }
        ]
      })
    }
  });

  const result = manager.analyzeStrategy({
    input: "create calculator",
    taskType: "dev.code.calculator",
    activeContext: [{ content: "active request" }]
  });

  assert.strictEqual(result.safety.executesTool, false, "StrategyManager must not execute tools");
  for (const name of ["Decision", "Attention", "Context", "Memory", "Goal", "Reasoning", "Reflection", "Evolution"]) {
    assert(result.connectedSystems.includes(name), `${name} should be connected`);
  }
  assert(result.strategyCount >= 8, "strategies should be generated from connected systems");
  assert(result.analysis.selectedStrategy, "strategy engine should select a strategy");
  assert(result.analysis.score > 0, "selected strategy should have score");
  assert(result.memory.strategyId === result.strategyAnalysisId, "strategy memory should persist result");

  const manualStrategies = strategyPlanner.plan({
    taskType: "dev.code.calculator",
    goals: [
      { taskType: "dev.code.calculator", goal: "blocked goal", status: "blocked", confidence: 0.95, riskLevel: "low" }
    ],
    reasoning: {
      taskType: "dev.code.calculator",
      selectedPlan: { id: "safe_plan" },
      confidence: 0.95,
      reason: "safe reasoning"
    }
  });
  const manual = strategyEngine.select({ strategies: manualStrategies, context: { taskType: "dev.code.calculator" } });
  assert.strictEqual(manual.selectedStrategy.sourceType, "reasoning", "blocked goal strategy should not outrank strong reasoning");

  const history = strategyMemory.query({ taskType: "dev.code.calculator" });
  assert(history.length >= 1, "strategy memory should be queryable");

  const src = sourceText();
  assert(!src.includes("ToolExecutionService.execute"), "strategy intelligence must not call ToolExecutionService");
  assert(!src.includes("ToolSelector.execute"), "strategy intelligence must not bypass ToolSelector");
  assert(!src.includes("VerifierCenter.verify"), "strategy intelligence must not bypass VerifierCenter");

  for (const file of [
    "strategy-manager.json",
    "strategy-engine.json",
    "strategy-plans.json",
    "strategy-evaluations.json",
    "strategy-memory.json"
  ]) {
    assert(fs.existsSync(path.join(rootDir, file)), `${file} should exist`);
  }

  return {
    ok: true,
    cases: [
      "strategy_manager",
      "strategy_engine",
      "strategy_planner",
      "strategy_evaluator",
      "strategy_memory",
      "external_connections",
      "no_tool_or_verifier_bypass"
    ]
  };
}

if (require.main === module) console.log(JSON.stringify(run(), null, 2));

module.exports = { run };
