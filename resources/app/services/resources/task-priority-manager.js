const fs = require("node:fs");
const path = require("node:path");
const { DEFAULT_RESOURCE_ROOT } = require("./agent-quota-manager");

const PRIORITY_SCORE = Object.freeze({
  urgent: 100,
  high: 75,
  normal: 50,
  low: 25
});

class TaskPriorityManager {
  constructor({ rootDir = DEFAULT_RESOURCE_ROOT, priorityFile = null } = {}) {
    this.rootDir = rootDir;
    this.priorityFile = priorityFile || path.join(rootDir, "priorities.json");
    this.ensureStore();
  }

  classify(task = {}) {
    const text = [task.priority, task.intent, task.title, task.name, task.action, task.target].filter(Boolean).join(" ").toLowerCase();
    let priority = "normal";
    if (/urgent|马上|立即|紧急|asap/.test(text)) priority = "urgent";
    else if (/high|重要|关键|critical/.test(text)) priority = "high";
    else if (/low|后台|稍后/.test(text)) priority = "low";
    if (task.riskLevel === "high" || task.needUserConfirm === true) priority = "high";
    return {
      priority,
      score: PRIORITY_SCORE[priority],
      reason: priority === "normal" ? "default_priority" : "matched_priority_rule"
    };
  }

  sort(tasks = []) {
    return [...tasks].map((task, index) => ({ task, index, priority: this.classify(task) }))
      .sort((a, b) => {
        if (b.priority.score !== a.priority.score) return b.priority.score - a.priority.score;
        return a.index - b.index;
      })
      .map((item) => ({ ...item.task, priority: item.priority.priority, priorityScore: item.priority.score }));
  }

  savePlan(planId = "", tasks = []) {
    const data = this.load();
    data.plans[planId || `plan-${Date.now()}`] = this.sort(tasks).map((task) => ({
      id: task.id || task.taskId || "",
      toolId: task.toolId || "",
      priority: task.priority,
      priorityScore: task.priorityScore
    }));
    this.save(data);
    return data.plans[planId || ""];
  }

  ensureStore() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.priorityFile)) this.save({ plans: {} });
  }

  load() {
    this.ensureStore();
    try {
      const parsed = JSON.parse(fs.readFileSync(this.priorityFile, "utf8"));
      return { plans: parsed.plans && typeof parsed.plans === "object" ? parsed.plans : {} };
    } catch {
      return { plans: {} };
    }
  }

  save(data = {}) {
    fs.mkdirSync(this.rootDir, { recursive: true });
    fs.writeFileSync(this.priorityFile, JSON.stringify({ plans: data.plans || {} }, null, 2), "utf8");
  }
}

module.exports = { TaskPriorityManager, PRIORITY_SCORE };
