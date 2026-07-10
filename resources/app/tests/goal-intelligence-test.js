const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const { GoalIntelligenceManager } = require("../services/goal-intelligence/goal-intelligence-manager");
const { GoalPursuitEngine } = require("../services/goal-intelligence/goal-pursuit-engine");
const { GoalAdaptationEngine } = require("../services/goal-intelligence/goal-adaptation-engine");
const { GoalConflictResolver } = require("../services/goal-intelligence/goal-conflict-resolver");
const { GoalMemory } = require("../services/goal-intelligence/goal-memory");

function root(name) {
  const dir = path.join("D:\\BaiQiuAI", "data", "goal-intelligence-tests", `run-${process.pid}`, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function sourceText() {
  const dir = path.join(__dirname, "..", "services", "goal-intelligence");
  return fs.readdirSync(dir)
    .filter((file) => file.endsWith(".js"))
    .map((file) => fs.readFileSync(path.join(dir, file), "utf8"))
    .join("\n");
}

function run() {
  const rootDir = root("goal");
  const pursuitEngine = new GoalPursuitEngine({ rootDir });
  const adaptationEngine = new GoalAdaptationEngine({ rootDir });
  const conflictResolver = new GoalConflictResolver({ rootDir });
  const goalMemory = new GoalMemory({ rootDir });
  const goals = [
    { goalId: "g1", taskType: "dev.code.calculator", goal: "create calculator", status: "active", confidence: 0.9, priorityScore: 0.95, riskLevel: "low" },
    { goalId: "g2", taskType: "dev.code.calculator", goal: "create calculator duplicate", status: "active", confidence: 0.8, priorityScore: 0.7, riskLevel: "low" },
    { goalId: "g3", taskType: "system.shutdown", goal: "shutdown", status: "active", confidence: 0.7, priorityScore: 0.6, riskLevel: "high" }
  ];
  const manager = new GoalIntelligenceManager({
    rootDir,
    pursuitEngine,
    adaptationEngine,
    conflictResolver,
    goalMemory,
    strategyManager: {
      analyzeStrategy: () => ({ analysis: { score: 1.05, selectedStrategy: { strategy: "use_reasoned_plan" } } })
    },
    decisionManager: {
      analyzeDecision: () => ({ decision: { score: 0.95, selectedOption: { action: "select_strategy" } } })
    },
    attentionManager: {
      focus: () => ({ selection: { selected: [{ attentionScore: 1.0, content: "focus goal" }] } })
    },
    contextManager: {
      buildContext: () => ({ items: [{ content: "goal context" }], truncated: false })
    },
    memoryCore: {
      retrieve: () => ({ memories: [{ content: "goal memory", retrievalScore: 0.8 }] })
    },
    goalManager: {
      listGoals: () => goals
    },
    reasoningEngine: {
      reason: () => ({ confidence: 0.94, selectedPlan: { id: "calculator_direct" }, reason: "reasoned" })
    },
    reflectionMemory: {
      getHints: () => ({ available: true, suggestion: "merge duplicate calculator goals", confidence: 0.82 })
    },
    evolutionEngine: {
      generateEvolutionAdvice: () => ({
        recommendations: [{ type: "goal", suggestion: "keep focused goal pursuit", confidence: 0.7 }]
      })
    }
  });

  const result = manager.analyzeGoal({
    input: "create calculator",
    taskType: "dev.code.calculator",
    activeContext: [{ content: "active request" }]
  });

  assert.strictEqual(result.safety.executesTool, false, "GoalIntelligenceManager must not execute tools");
  for (const name of ["Strategy", "Decision", "Attention", "Context", "Memory", "Reasoning", "Reflection", "Evolution"]) {
    assert(result.connectedSystems.includes(name), `${name} should be connected`);
  }
  assert(result.pursuit.selectedGoal.goalId === "g1", "pursuit should select highest priority goal");
  assert(result.conflicts.hasConflict, "duplicate active goals should be detected");
  assert(result.adaptation.suggestions.some((item) => item.type === "resolve_conflict"), "adaptation should include conflict resolution");
  assert(result.memory.goalIntelligenceId === result.goalIntelligenceId, "goal memory should persist result");
  assert(result.score > 0, "goal intelligence score should be positive");

  const conflict = conflictResolver.resolve(goals);
  assert(conflict.conflicts.some((item) => item.type === "duplicate_active_goal"), "conflict resolver should detect duplicate active goals");

  const history = goalMemory.query({ taskType: "dev.code.calculator" });
  assert(history.length >= 1, "goal memory should be queryable");

  const src = sourceText();
  assert(!src.includes("ToolExecutionService.execute"), "goal intelligence must not call ToolExecutionService");
  assert(!src.includes("ToolSelector.execute"), "goal intelligence must not bypass ToolSelector");
  assert(!src.includes("VerifierCenter.verify"), "goal intelligence must not bypass VerifierCenter");

  for (const file of [
    "goal-intelligence-manager.json",
    "goal-pursuit.json",
    "goal-adaptation.json",
    "goal-conflicts.json",
    "goal-memory.json"
  ]) {
    assert(fs.existsSync(path.join(rootDir, file)), `${file} should exist`);
  }

  return {
    ok: true,
    cases: [
      "goal_intelligence_manager",
      "goal_pursuit_engine",
      "goal_adaptation_engine",
      "goal_conflict_resolver",
      "goal_memory",
      "external_connections",
      "no_tool_or_verifier_bypass"
    ]
  };
}

if (require.main === module) console.log(JSON.stringify(run(), null, 2));

module.exports = { run };
