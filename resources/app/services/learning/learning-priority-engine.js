const fs = require("node:fs");
const path = require("node:path");
const { dataRoot } = require("../data-root");

const DEFAULT_LEARNING_ROOT = path.join(dataRoot(), "learning");

function nowIso() {
  return new Date().toISOString();
}

class LearningPriorityEngine {
  constructor({ rootDir = DEFAULT_LEARNING_ROOT } = {}) {
    this.rootDir = rootDir;
    this.filePath = path.join(rootDir, "learning-priority.json");
    this.ensureStore();
  }

  calculate(input = {}) {
    const failureCount = Math.max(0, Number(input.failureCount || input.failCount || 0));
    const successRateDrop = Math.max(0, Number(input.successRateDrop || 0));
    const usageFrequency = Math.max(0, Number(input.usageFrequency || input.usageCount || 0));
    const taskImportance = Math.max(0, Math.min(1, Number(input.taskImportance || 0.5)));
    const rawScore = (failureCount * 12) + (successRateDrop * 100) + Math.min(usageFrequency, 50) + (taskImportance * 30);
    const score = Math.max(0, Math.min(100, Math.round(rawScore)));
    const level = score >= 80 ? "critical" : score >= 55 ? "high" : score >= 25 ? "medium" : "low";
    const result = {
      score,
      level,
      factors: { failureCount, successRateDrop, usageFrequency, taskImportance },
      timestamp: nowIso(),
      safety: this.safety()
    };
    this.writeJson(this.filePath, result);
    return result;
  }

  rank(tasks = []) {
    return tasks
      .map((task) => ({
        ...task,
        priority: task.priority || this.calculate(task.priorityInput || task.metrics || task)
      }))
      .sort((a, b) => Number(b.priority?.score || 0) - Number(a.priority?.score || 0));
  }

  safety() {
    return {
      advisoryOnly: true,
      executesTool: false,
      modifiesPermission: false,
      bypassesToolSelector: false,
      bypassesVerifierCenter: false
    };
  }

  ensureStore() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.filePath)) this.writeJson(this.filePath, { score: 0, level: "low", safety: this.safety() });
  }

  writeJson(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  }
}

module.exports = { LearningPriorityEngine, DEFAULT_LEARNING_ROOT };
