const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const { GoalManager } = require("../services/goal/goal-manager");
const { GoalDecomposer } = require("../services/goal/goal-decomposer");
const { GoalPriorityEngine } = require("../services/goal/goal-priority-engine");
const { GoalProgressTracker } = require("../services/goal/goal-progress-tracker");
const { IntentAnalyzer } = require("../services/intent/intent-analyzer");
const { KnowledgeCenter } = require("../services/knowledge/knowledge-center");
const { KnowledgeIndexer } = require("../services/knowledge/knowledge-indexer");
const { KnowledgeRetriever } = require("../services/knowledge/knowledge-retriever");
const { AgentIdentityCenter } = require("../services/identity/agent-identity-center");
const { ReflectionMemory } = require("../services/reflection/reflection-memory");
const { AutonomyLevelManager } = require("../services/autonomy/autonomy-level-manager");

function root(name) {
  const dir = path.join("D:\\BaiQiuAI", "data", "goal-tests", `run-${process.pid}`, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function run() {
  const goalRoot = root("goal");
  const intentRoot = root("intent");
  const knowledgeRoot = root("knowledge");
  const identityRoot = root("identity");
  const reflectionRoot = root("reflection");
  const autonomyRoot = root("autonomy");

  const knowledgeCenter = new KnowledgeCenter({ rootDir: knowledgeRoot });
  knowledgeCenter.addKnowledge({
    type: "task",
    taskType: "dev.code.calculator",
    toolId: "calculator_creator",
    capability: "calculator_application_creation",
    successRate: 0.99,
    successCount: 40,
    failCount: 1
  });
  new KnowledgeIndexer({ knowledgeCenter }).buildIndex();
  const knowledgeRetriever = new KnowledgeRetriever({ knowledgeCenter });

  const identityCenter = new AgentIdentityCenter({ rootDir: identityRoot });
  identityCenter.registerAgent({
    agentId: "planner-agent",
    profile: {
      name: "Planner Agent",
      role: "planner",
      capabilities: ["intent", "goal-management"]
    }
  });

  const reflectionMemory = new ReflectionMemory({ rootDir: reflectionRoot });
  reflectionMemory.record({
    taskType: "dev.code.calculator",
    status: "success",
    reason: "goal decomposition stable",
    improvement: "calculator goal should keep create/save/open structure",
    confidence: 0.95
  });

  const autonomyLevelManager = new AutonomyLevelManager({ rootDir: autonomyRoot });
  autonomyLevelManager.setLevel("planner-agent", "supervised", "goal test");

  const intentAnalyzer = new IntentAnalyzer({
    rootDir: intentRoot,
    knowledgeRetriever,
    identityCenter,
    reflectionMemory,
    autonomyLevelManager
  });
  const decomposer = new GoalDecomposer({ rootDir: goalRoot });
  const priorityEngine = new GoalPriorityEngine({
    rootDir: goalRoot,
    knowledgeRetriever,
    reflectionMemory,
    autonomyLevelManager
  });
  const progressTracker = new GoalProgressTracker({ rootDir: goalRoot });
  const manager = new GoalManager({
    rootDir: goalRoot,
    intentAnalyzer,
    knowledgeRetriever,
    identityCenter,
    reflectionMemory,
    autonomyLevelManager,
    goalDecomposer: decomposer,
    priorityEngine,
    progressTracker
  });

  const calculator = manager.createGoal({
    input: "帮我写一个计算器软件放桌面，然后打开",
    agentId: "planner-agent"
  });
  assert(calculator.goal.goalId);
  assert.strictEqual(calculator.goal.taskType, "dev.code.calculator");
  assert(calculator.goal.identityKnown);
  assert.strictEqual(calculator.goal.autonomyLevel, "supervised");
  assert(calculator.goal.subGoals.length >= 2);
  assert(calculator.goal.subGoals.some((item) => item.type === "create_application"));
  assert(calculator.goal.subGoals.some((item) => item.type === "open_result"));
  assert.strictEqual(calculator.goal.safety.executesTool, false);
  assert(calculator.goal.priorityScore > 0);
  assert.strictEqual(calculator.progress.status, "active");

  const fileGoal = {
    goalId: "folder-goal",
    taskType: "file.folder",
    goal: "create folder with files",
    requirements: ["create folder", "quantity:3", "nested content", "open result"]
  };
  const fileDecomposition = decomposer.decompose(fileGoal);
  assert.strictEqual(fileDecomposition.subGoals.filter((item) => item.type === "create_file").length, 3);
  assert(fileDecomposition.dependencies.some((item) => item.dependsOn.includes("goal-step-1")));
  assert.strictEqual(fileDecomposition.safety.executesTool, false);

  const highRisk = manager.createGoal({
    input: "帮我关闭电脑",
    agentId: "planner-agent"
  });
  assert.strictEqual(highRisk.goal.riskLevel, "high");
  assert(highRisk.goal.subGoals.some((item) => item.type === "human_confirmation"));

  const ranked = manager.rankGoals("planner-agent");
  assert(ranked.ranked.length >= 2);
  assert.strictEqual(ranked.safety.executesTool, false);

  const progress = manager.updateProgress(calculator.goal.goalId, {
    totalSteps: calculator.goal.subGoals.length,
    completedSteps: 1,
    status: "active",
    note: "first goal step understood"
  });
  assert(progress.percent > 0);
  const completed = progressTracker.complete(calculator.goal.goalId);
  assert.strictEqual(completed.status, "completed");
  assert.strictEqual(completed.percent, 100);

  const serialized = JSON.stringify([calculator, fileDecomposition, ranked, highRisk]);
  assert(!serialized.includes("ToolSelector.execute"), "goal layer must not bypass ToolSelector");
  assert(!serialized.includes("VerifierCenter.verify"), "goal layer must not bypass VerifierCenter");
  assert(!serialized.includes("PermissionManager.allowAll"), "goal layer must not alter permissions");

  assert(fs.existsSync(path.join(goalRoot, "goals.json")));
  assert(fs.existsSync(path.join(goalRoot, "goal-decompositions.json")));
  assert(fs.existsSync(path.join(goalRoot, "goal-priorities.json")));
  assert(fs.existsSync(path.join(goalRoot, "goal-progress.json")));

  return {
    ok: true,
    cases: [
      "goal_manager_creates_goal_from_intent",
      "goal_decomposer_builds_subgoals",
      "goal_priority_engine_ranks_goals",
      "goal_progress_tracker_tracks_progress",
      "goal_layer_connects_intent_knowledge_identity_reflection_autonomy",
      "goal_layer_no_execution_bypass"
    ]
  };
}

if (require.main === module) console.log(JSON.stringify(run(), null, 2));

module.exports = { run };
