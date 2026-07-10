const fs = require("node:fs");
const path = require("node:path");
const { DEFAULT_LEARNING_ROOT, LearningPriorityEngine } = require("./learning-priority-engine");

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix = "learn-task") {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

class LearningScheduler {
  constructor({ rootDir = DEFAULT_LEARNING_ROOT, priorityEngine = null, maxTasks = 300 } = {}) {
    this.rootDir = rootDir;
    this.tasksFile = path.join(rootDir, "learning-tasks.json");
    this.historyFile = path.join(rootDir, "learning-history.json");
    this.priorityEngine = priorityEngine || new LearningPriorityEngine({ rootDir });
    this.maxTasks = maxTasks;
    this.ensureStore();
  }

  schedule(input = {}) {
    const signals = input.signals || {};
    const tasks = [];
    if (signals.periodic === true) tasks.push(this.makeTask("periodic_review", input));
    if (Number(signals.failureRate || 0) >= 0.25 || Number(signals.failureCount || 0) >= 3) tasks.push(this.makeTask("failure_rate_review", input));
    if (Number(signals.performanceDrop || 0) > 0) tasks.push(this.makeTask("performance_decline_review", input));
    if (signals.newSkill === true || input.eventType === "skill_added") tasks.push(this.makeTask("new_skill_review", input));
    if (!tasks.length && input.force === true) tasks.push(this.makeTask("manual_review", input));
    const ranked = this.priorityEngine.rank(tasks);
    this.saveTasks(ranked);
    this.appendHistory({
      event: "schedule",
      taskType: input.taskType || "",
      count: ranked.length,
      triggers: Object.keys(signals).filter((key) => signals[key]),
      timestamp: nowIso(),
      safety: this.safety()
    });
    return ranked;
  }

  makeTask(type, input = {}) {
    const metrics = input.metrics || {};
    const priorityInput = {
      failureCount: input.signals?.failureCount ?? metrics.failCount ?? 0,
      successRateDrop: input.signals?.successRateDrop ?? input.signals?.performanceDrop ?? 0,
      usageFrequency: input.signals?.usageFrequency ?? metrics.sampleCount ?? metrics.usageCount ?? 0,
      taskImportance: input.taskImportance ?? 0.5
    };
    return {
      taskId: makeId(type),
      type,
      taskType: input.taskType || metrics.taskType || "",
      source: input.source || "learning-orchestrator",
      priorityInput,
      status: "scheduled",
      reason: this.reasonFor(type),
      timestamp: nowIso(),
      safety: this.safety()
    };
  }

  reasonFor(type) {
    if (type === "periodic_review") return "periodic learning review";
    if (type === "failure_rate_review") return "failure rate crossed learning threshold";
    if (type === "performance_decline_review") return "performance decline detected";
    if (type === "new_skill_review") return "new skill joined the capability surface";
    return "manual learning review";
  }

  loadTasks() {
    return this.readJson(this.tasksFile, { tasks: [] });
  }

  saveTasks(tasks = []) {
    const existing = this.loadTasks().tasks;
    this.writeJson(this.tasksFile, { tasks: [...existing, ...tasks].slice(-this.maxTasks) });
  }

  appendHistory(item = {}) {
    const data = this.readJson(this.historyFile, { history: [] });
    data.history.push(item);
    this.writeJson(this.historyFile, { history: data.history.slice(-this.maxTasks) });
  }

  safety() {
    return {
      learningOnly: true,
      advisoryOnly: true,
      executesTool: false,
      modifiesPermission: false,
      bypassesToolSelector: false,
      bypassesVerifierCenter: false
    };
  }

  ensureStore() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.tasksFile)) this.writeJson(this.tasksFile, { tasks: [] });
    if (!fs.existsSync(this.historyFile)) this.writeJson(this.historyFile, { history: [] });
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

module.exports = { LearningScheduler };
