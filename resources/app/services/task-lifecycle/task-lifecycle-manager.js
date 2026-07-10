const fs = require("node:fs");
const path = require("node:path");
const { GoalManager } = require("../goal/goal-manager");
const { IntentAnalyzer } = require("../intent/intent-analyzer");
const { KnowledgeRetriever } = require("../knowledge/knowledge-retriever");
const { ReflectionMemory } = require("../reflection/reflection-memory");
const { AutonomyLevelManager } = require("../autonomy/autonomy-level-manager");
const { TaskStateMachine } = require("./task-state-machine");
const { TaskScheduler } = require("./task-scheduler");
const { TaskHistoryManager, DEFAULT_TASK_LIFECYCLE_ROOT } = require("./task-history-manager");

function nowIso() {
  return new Date().toISOString();
}

class TaskLifecycleManager {
  constructor({
    rootDir = DEFAULT_TASK_LIFECYCLE_ROOT,
    goalManager = null,
    intentAnalyzer = null,
    knowledgeRetriever = null,
    reflectionMemory = null,
    autonomyLevelManager = null,
    stateMachine = null,
    scheduler = null,
    historyManager = null
  } = {}) {
    this.rootDir = rootDir;
    this.tasksFile = path.join(rootDir, "tasks.json");
    this.knowledgeRetriever = knowledgeRetriever || new KnowledgeRetriever();
    this.reflectionMemory = reflectionMemory || new ReflectionMemory();
    this.autonomyLevelManager = autonomyLevelManager || new AutonomyLevelManager();
    this.intentAnalyzer = intentAnalyzer || new IntentAnalyzer({
      knowledgeRetriever: this.knowledgeRetriever,
      reflectionMemory: this.reflectionMemory,
      autonomyLevelManager: this.autonomyLevelManager
    });
    this.goalManager = goalManager || new GoalManager({
      intentAnalyzer: this.intentAnalyzer,
      knowledgeRetriever: this.knowledgeRetriever,
      reflectionMemory: this.reflectionMemory,
      autonomyLevelManager: this.autonomyLevelManager
    });
    this.historyManager = historyManager || new TaskHistoryManager({ rootDir });
    this.stateMachine = stateMachine || new TaskStateMachine({ rootDir, historyManager: this.historyManager });
    this.scheduler = scheduler || new TaskScheduler({
      rootDir,
      knowledgeRetriever: this.knowledgeRetriever,
      reflectionMemory: this.reflectionMemory,
      autonomyLevelManager: this.autonomyLevelManager,
      historyManager: this.historyManager
    });
    this.ensureStore();
  }

  createLifecycle({ input = "", agentId = "default-agent", conversation = [] } = {}) {
    const goalBundle = this.goalManager.createGoal({ input, agentId, conversation });
    const tasks = this.createTasksFromGoal(goalBundle.goal);
    for (const task of tasks) {
      this.stateMachine.initialize(task);
      this.historyManager.record({
        taskId: task.taskId,
        goalId: task.goalId,
        agentId,
        event: "task_created",
        to: task.status,
        metadata: { type: task.type, riskLevel: task.riskLevel }
      });
    }
    const schedule = this.scheduler.schedule(tasks, { agentId, taskType: goalBundle.goal.taskType });
    for (const task of schedule.tasks) this.stateMachine.transition(task, "scheduled", "scheduled by lifecycle manager");
    const lifecycle = {
      lifecycleId: `task-life-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      agentId,
      goalId: goalBundle.goal.goalId,
      taskType: goalBundle.goal.taskType,
      sourceInput: input,
      taskIds: tasks.map((task) => task.taskId),
      status: "scheduled",
      goal: goalBundle.goal,
      schedule,
      safety: this.safety(),
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    this.saveTasks(tasks);
    this.saveLifecycle(lifecycle);
    return { lifecycle, goal: goalBundle.goal, tasks, schedule };
  }

  createTasksFromGoal(goal = {}) {
    const subGoals = Array.isArray(goal.subGoals) ? goal.subGoals : [];
    return subGoals.map((subGoal, index) => ({
      taskId: `${goal.goalId}.task-${index + 1}`,
      goalId: goal.goalId,
      agentId: goal.agentId || "default-agent",
      name: subGoal.name || subGoal.id,
      type: subGoal.type || "task",
      taskType: goal.taskType || "",
      status: "pending",
      dependsOn: (subGoal.dependsOn || []).map((dep) => `${goal.goalId}.task-${Number(String(dep).replace("goal-step-", "")) || 1}`),
      riskLevel: subGoal.riskLevel || goal.riskLevel || "low",
      sourceGoalStepId: subGoal.id || "",
      requirement: subGoal.requirement || "",
      lifecycleOnly: true,
      safety: this.safety(),
      createdAt: nowIso(),
      updatedAt: nowIso()
    }));
  }

  transitionTask(taskId = "", nextStatus = "", reason = "") {
    const task = this.getTask(taskId);
    if (!task) return null;
    const state = this.stateMachine.transition(task, nextStatus, reason);
    if (state.transitionAllowed === false) return state;
    const updated = {
      ...task,
      status: state.status,
      updatedAt: state.updatedAt
    };
    this.saveTasks([updated]);
    return state;
  }

  getTask(taskId = "") {
    return this.load().tasks[taskId] || null;
  }

  listTasks({ goalId = "", agentId = "" } = {}) {
    return Object.values(this.load().tasks)
      .filter((task) => !goalId || task.goalId === goalId)
      .filter((task) => !agentId || task.agentId === agentId);
  }

  saveTasks(tasks = []) {
    const data = this.load();
    for (const task of tasks) data.tasks[task.taskId] = task;
    this.writeJson(this.tasksFile, { tasks: data.tasks, lifecycles: data.lifecycles });
  }

  saveLifecycle(lifecycle = {}) {
    const data = this.load();
    data.lifecycles[lifecycle.lifecycleId] = lifecycle;
    this.writeJson(this.tasksFile, { tasks: data.tasks, lifecycles: data.lifecycles });
  }

  safety() {
    return {
      lifecycleOnly: true,
      executesTool: false,
      bypassesToolSelector: false,
      bypassesVerifierCenter: false
    };
  }

  load() {
    return this.readJson(this.tasksFile, { tasks: {}, lifecycles: {} });
  }

  ensureStore() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.tasksFile)) this.writeJson(this.tasksFile, { tasks: {}, lifecycles: {} });
  }

  readJson(file, fallback) {
    this.ensureStore();
    try {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      return fallback;
    }
  }

  writeJson(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  }
}

module.exports = { TaskLifecycleManager };
