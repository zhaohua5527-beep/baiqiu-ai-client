const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const { TaskLifecycleManager } = require("../services/task-lifecycle/task-lifecycle-manager");
const { TaskStateMachine } = require("../services/task-lifecycle/task-state-machine");
const { TaskScheduler } = require("../services/task-lifecycle/task-scheduler");
const { TaskHistoryManager } = require("../services/task-lifecycle/task-history-manager");
const { GoalManager } = require("../services/goal/goal-manager");
const { IntentAnalyzer } = require("../services/intent/intent-analyzer");
const { KnowledgeCenter } = require("../services/knowledge/knowledge-center");
const { KnowledgeIndexer } = require("../services/knowledge/knowledge-indexer");
const { KnowledgeRetriever } = require("../services/knowledge/knowledge-retriever");
const { AgentIdentityCenter } = require("../services/identity/agent-identity-center");
const { ReflectionMemory } = require("../services/reflection/reflection-memory");
const { AutonomyLevelManager } = require("../services/autonomy/autonomy-level-manager");

function root(name) {
  const dir = path.join("D:\\BaiQiuAI", "data", "task-lifecycle-tests", `run-${process.pid}`, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function run() {
  const lifecycleRoot = root("task-lifecycle");
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
      capabilities: ["goal-management", "task-lifecycle"]
    }
  });

  const reflectionMemory = new ReflectionMemory({ rootDir: reflectionRoot });
  reflectionMemory.record({
    taskType: "dev.code.calculator",
    status: "success",
    reason: "lifecycle scheduling stable",
    improvement: "schedule create before open",
    confidence: 0.95
  });

  const autonomyLevelManager = new AutonomyLevelManager({ rootDir: autonomyRoot });
  autonomyLevelManager.setLevel("planner-agent", "supervised", "task lifecycle test");

  const intentAnalyzer = new IntentAnalyzer({
    rootDir: intentRoot,
    knowledgeRetriever,
    identityCenter,
    reflectionMemory,
    autonomyLevelManager
  });
  const goalManager = new GoalManager({
    rootDir: goalRoot,
    intentAnalyzer,
    knowledgeRetriever,
    identityCenter,
    reflectionMemory,
    autonomyLevelManager
  });
  const historyManager = new TaskHistoryManager({ rootDir: lifecycleRoot });
  const stateMachine = new TaskStateMachine({ rootDir: lifecycleRoot, historyManager });
  const scheduler = new TaskScheduler({
    rootDir: lifecycleRoot,
    knowledgeRetriever,
    reflectionMemory,
    autonomyLevelManager,
    historyManager
  });
  const lifecycleManager = new TaskLifecycleManager({
    rootDir: lifecycleRoot,
    goalManager,
    intentAnalyzer,
    knowledgeRetriever,
    reflectionMemory,
    autonomyLevelManager,
    historyManager,
    stateMachine,
    scheduler
  });

  const lifecycleBundle = lifecycleManager.createLifecycle({
    input: "帮我写一个计算器软件放桌面，然后打开",
    agentId: "planner-agent"
  });
  assert(lifecycleBundle.lifecycle.lifecycleId);
  assert.strictEqual(lifecycleBundle.lifecycle.status, "scheduled");
  assert.strictEqual(lifecycleBundle.goal.taskType, "dev.code.calculator");
  assert(lifecycleBundle.tasks.length >= 2);
  assert(lifecycleBundle.tasks.every((task) => task.safety.executesTool === false));
  assert(lifecycleBundle.schedule.tasks.length === lifecycleBundle.tasks.length);
  assert.strictEqual(lifecycleBundle.schedule.safety.executesTool, false);

  const firstTask = lifecycleBundle.tasks[0];
  const scheduledState = stateMachine.getState(firstTask.taskId);
  assert.strictEqual(scheduledState.status, "scheduled");

  const active = lifecycleManager.transitionTask(firstTask.taskId, "active", "ready to work");
  assert.strictEqual(active.status, "active");
  const completed = lifecycleManager.transitionTask(firstTask.taskId, "completed", "lifecycle marked complete");
  assert.strictEqual(completed.status, "completed");

  const invalid = lifecycleManager.transitionTask(firstTask.taskId, "active", "cannot reopen completed task");
  assert.strictEqual(invalid.transitionAllowed, false);
  assert.strictEqual(stateMachine.getState(firstTask.taskId).status, "completed");

  const highRiskLifecycle = lifecycleManager.createLifecycle({
    input: "帮我关闭电脑",
    agentId: "planner-agent"
  });
  assert(highRiskLifecycle.tasks.some((task) => task.riskLevel === "high"));
  const highRiskTask = highRiskLifecycle.tasks.find((task) => task.riskLevel === "high");
  assert(highRiskTask);
  assert.strictEqual(highRiskTask.safety.executesTool, false);

  const scheduled = scheduler.schedule([
    { taskId: "low", goalId: "g", agentId: "planner-agent", name: "low", taskType: "dev.code.calculator", status: "pending", riskLevel: "low", dependsOn: [] },
    { taskId: "high", goalId: "g", agentId: "planner-agent", name: "high", taskType: "system.shutdown", status: "pending", riskLevel: "high", dependsOn: [] }
  ], { agentId: "planner-agent", taskType: "dev.code.calculator" });
  assert.strictEqual(scheduled.tasks[0].taskId, "low", "low risk lifecycle task should schedule before high risk");

  const history = historyManager.list({ agentId: "planner-agent" });
  assert(history.some((item) => item.event === "task_created"));
  assert(history.some((item) => item.event === "state_transition"));
  assert(history.every((item) => item.safety.executesTool === false));

  const serialized = JSON.stringify([lifecycleBundle, highRiskLifecycle, history]);
  assert(!serialized.includes("ToolSelector.execute"), "task lifecycle layer must not bypass ToolSelector");
  assert(!serialized.includes("VerifierCenter.verify"), "task lifecycle layer must not bypass VerifierCenter");
  assert(!serialized.includes("PermissionManager.allowAll"), "task lifecycle layer must not alter permissions");

  assert(fs.existsSync(path.join(lifecycleRoot, "tasks.json")));
  assert(fs.existsSync(path.join(lifecycleRoot, "task-states.json")));
  assert(fs.existsSync(path.join(lifecycleRoot, "task-schedule.json")));
  assert(fs.existsSync(path.join(lifecycleRoot, "task-history.json")));

  return {
    ok: true,
    cases: [
      "task_lifecycle_manager_creates_tasks_from_goal",
      "task_state_machine_controls_transitions",
      "task_scheduler_prioritizes_without_execution",
      "task_history_manager_records_events",
      "task_lifecycle_connects_goal_intent_knowledge_reflection_autonomy",
      "task_lifecycle_layer_no_execution_bypass"
    ]
  };
}

if (require.main === module) console.log(JSON.stringify(run(), null, 2));

module.exports = { run };
