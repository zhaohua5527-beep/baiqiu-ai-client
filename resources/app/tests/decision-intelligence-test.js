const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const { DecisionManager } = require("../services/decision-intelligence/decision-manager");
const { DecisionEngine } = require("../services/decision-intelligence/decision-engine");
const { OptionGenerator } = require("../services/decision-intelligence/option-generator");
const { DecisionEvaluator } = require("../services/decision-intelligence/decision-evaluator");
const { DecisionMemory } = require("../services/decision-intelligence/decision-memory");

function root(name) {
  const dir = path.join("D:\\BaiQiuAI", "data", "decision-intelligence-tests", `run-${process.pid}`, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function sourceText() {
  const dir = path.join(__dirname, "..", "services", "decision-intelligence");
  return fs.readdirSync(dir)
    .filter((file) => file.endsWith(".js"))
    .map((file) => fs.readFileSync(path.join(dir, file), "utf8"))
    .join("\n");
}

function run() {
  const rootDir = root("decision");
  const optionGenerator = new OptionGenerator({ rootDir });
  const evaluator = new DecisionEvaluator({ rootDir });
  const decisionEngine = new DecisionEngine({ rootDir, evaluator });
  const decisionMemory = new DecisionMemory({ rootDir });
  const manager = new DecisionManager({
    rootDir,
    optionGenerator,
    evaluator,
    decisionEngine,
    decisionMemory,
    attentionManager: {
      focus: () => ({
        selection: {
          selected: [
            { source: "AttentionManager", sourceType: "goal", taskType: "dev.code.calculator", content: "finish calculator goal", confidence: 0.9, attentionScore: 1.1 }
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
        { taskType: "dev.code.calculator", goal: "create calculator", status: "active", confidence: 0.92, riskLevel: "low" }
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
      getHints: () => ({ available: true, suggestion: "avoid redundant open step", confidence: 0.8 })
    },
    evolutionEngine: {
      generateEvolutionAdvice: () => ({
        recommendations: [
          { type: "strategy", target: "calculator", suggestion: "keep direct calculator strategy", confidence: 0.7 }
        ]
      })
    }
  });

  const result = manager.analyzeDecision({
    input: "create calculator",
    taskType: "dev.code.calculator",
    activeContext: [{ content: "active request" }]
  });

  assert.strictEqual(result.safety.executesTool, false, "DecisionManager must not execute tools");
  assert(result.connectedSystems.includes("Attention"));
  assert(result.connectedSystems.includes("Context"));
  assert(result.connectedSystems.includes("Memory"));
  assert(result.connectedSystems.includes("Goal"));
  assert(result.connectedSystems.includes("Reasoning"));
  assert(result.connectedSystems.includes("Reflection"));
  assert(result.connectedSystems.includes("Evolution"));
  assert(result.optionCount >= 7, "options should be generated from connected systems");
  assert(result.decision.selectedOption, "decision engine should select an option");
  assert(result.decision.score > 0, "decision should have score");
  assert(result.memory.decisionId === result.decisionId, "decision memory should persist selected decision");

  const manualOptions = optionGenerator.generate({
    taskType: "dev.code.calculator",
    goals: [
      { taskType: "dev.code.calculator", goal: "blocked goal", status: "blocked", confidence: 0.9, riskLevel: "low" }
    ],
    reasoning: {
      taskType: "dev.code.calculator",
      selectedPlan: { id: "safe_plan" },
      confidence: 0.95,
      reason: "safe reasoning"
    }
  });
  const manualDecision = decisionEngine.decide({ options: manualOptions, context: { taskType: "dev.code.calculator" } });
  assert(manualDecision.selectedOption.sourceType === "reasoning", "blocked goal should not outrank strong reasoning");

  const history = decisionMemory.query({ taskType: "dev.code.calculator" });
  assert(history.length >= 1, "decision memory should be queryable");

  const src = sourceText();
  assert(!src.includes("ToolExecutionService.execute"), "decision intelligence must not call ToolExecutionService");
  assert(!src.includes("ToolSelector.execute"), "decision intelligence must not bypass ToolSelector");
  assert(!src.includes("VerifierCenter.verify"), "decision intelligence must not bypass VerifierCenter");

  for (const file of [
    "decision-manager.json",
    "decision-engine.json",
    "decision-options.json",
    "decision-evaluations.json",
    "decision-memory.json"
  ]) {
    assert(fs.existsSync(path.join(rootDir, file)), `${file} should exist`);
  }

  return {
    ok: true,
    cases: [
      "decision_manager",
      "decision_engine",
      "option_generator",
      "decision_evaluator",
      "decision_memory",
      "external_connections",
      "no_tool_or_verifier_bypass"
    ]
  };
}

if (require.main === module) console.log(JSON.stringify(run(), null, 2));

module.exports = { run };
