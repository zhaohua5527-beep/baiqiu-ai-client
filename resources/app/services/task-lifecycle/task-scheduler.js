const fs = require("node:fs");
const path = require("node:path");
const { KnowledgeRetriever } = require("../knowledge/knowledge-retriever");
const { ReflectionMemory } = require("../reflection/reflection-memory");
const { AutonomyLevelManager } = require("../autonomy/autonomy-level-manager");
const { TaskHistoryManager, DEFAULT_TASK_LIFECYCLE_ROOT } = require("./task-history-manager");

function nowIso() {
  return new Date().toISOString();
}

class TaskScheduler {
  constructor({
    rootDir = DEFAULT_TASK_LIFECYCLE_ROOT,
    knowledgeRetriever = null,
    reflectionMemory = null,
    autonomyLevelManager = null,
    historyManager = null
  } = {}) {
    this.rootDir = rootDir;
    this.scheduleFile = path.join(rootDir, "task-schedule.json");
    this.knowledgeRetriever = knowledgeRetriever || new KnowledgeRetriever();
    this.reflectionMemory = reflectionMemory || new ReflectionMemory();
    this.autonomyLevelManager = autonomyLevelManager || new AutonomyLevelManager();
    this.historyManager = historyManager || new TaskHistoryManager({ rootDir });
    this.ensureStore();
  }

  schedule(tasks = [], { agentId = "default-agent", taskType = "" } = {}) {
    const autonomy = this.autonomyLevelManager.getLevel(agentId);
    const scheduled = tasks.map((task) => this.scoreTask(task, { autonomy, taskType }))
      .sort((a, b) => Number(b.scheduleScore || 0) - Number(a.scheduleScore || 0));
    const result = {
      scheduleId: `schedule-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      agentId,
      taskType,
      tasks: scheduled,
      safety: this.safety(),
      timestamp: nowIso()
    };
    this.append(result);
    for (const task of scheduled) {
      this.historyManager.record({
        taskId: task.taskId,
        goalId: task.goalId,
        agentId,
        event: "task_scheduled",
        to: "scheduled",
        reason: `scheduleScore=${task.scheduleScore}`
      });
    }
    return result;
  }

  scoreTask(task = {}, { autonomy = {}, taskType = "" } = {}) {
    const knowledge = this.knowledgeRetriever.retrieve({ taskType: task.taskType || taskType, task: task.name || "" });
    const reflection = this.reflectionMemory.getHints({ taskType: task.taskType || taskType });
    const dependencyPenalty = Array.isArray(task.dependsOn) ? task.dependsOn.length * 10 : 0;
    const riskPenalty = task.riskLevel === "high" ? 35 : task.riskLevel === "medium" ? 10 : 0;
    const statusScore = task.status === "pending" ? 30 : 0;
    const autonomyScore = Number(autonomy.score || 0) * 5;
    const knowledgeScore = Math.round(Number(knowledge.successRate || 0) * 20);
    const reflectionScore = reflection.available ? Math.round(Number(reflection.confidence || 0) * 10) : 0;
    const scheduleScore = Math.max(0, statusScore + autonomyScore + knowledgeScore + reflectionScore - dependencyPenalty - riskPenalty);
    return {
      ...task,
      scheduleScore,
      scheduleReason: {
        statusScore,
        autonomyScore,
        knowledgeScore,
        reflectionScore,
        dependencyPenalty,
        riskPenalty
      }
    };
  }

  append(item = {}) {
    const data = this.load();
    data.schedules.push(item);
    this.writeJson(this.scheduleFile, { schedules: data.schedules.slice(-300) });
  }

  load() {
    return this.readJson(this.scheduleFile, { schedules: [] });
  }

  safety() {
    return {
      lifecycleOnly: true,
      executesTool: false,
      bypassesToolSelector: false,
      bypassesVerifierCenter: false
    };
  }

  ensureStore() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.scheduleFile)) this.writeJson(this.scheduleFile, { schedules: [] });
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

module.exports = { TaskScheduler };
