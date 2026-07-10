const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_GOAL_ROOT = path.join("D:\\BaiQiuAI", "data", "goals");

function nowIso() {
  return new Date().toISOString();
}

class GoalProgressTracker {
  constructor({ rootDir = DEFAULT_GOAL_ROOT } = {}) {
    this.rootDir = rootDir;
    this.progressFile = path.join(rootDir, "goal-progress.json");
    this.ensureStore();
  }

  start(goal = {}) {
    const progress = {
      goalId: goal.goalId || "",
      status: "active",
      totalSteps: Array.isArray(goal.subGoals) ? goal.subGoals.length : 0,
      completedSteps: 0,
      percent: 0,
      history: [{ status: "active", note: "goal started", timestamp: nowIso() }],
      updatedAt: nowIso()
    };
    this.saveProgress(progress);
    return progress;
  }

  update(goalId = "", patch = {}) {
    const data = this.load();
    const current = data.progress[goalId] || {
      goalId,
      status: "active",
      totalSteps: 0,
      completedSteps: 0,
      percent: 0,
      history: []
    };
    const totalSteps = Number(patch.totalSteps ?? current.totalSteps ?? 0);
    const completedSteps = Number(patch.completedSteps ?? current.completedSteps ?? 0);
    const percent = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : Number(patch.percent ?? current.percent ?? 0);
    const updated = {
      ...current,
      ...patch,
      totalSteps,
      completedSteps,
      percent: Math.max(0, Math.min(100, percent)),
      updatedAt: nowIso()
    };
    updated.history = [
      ...(Array.isArray(current.history) ? current.history : []),
      {
        status: updated.status,
        note: patch.note || "",
        completedSteps: updated.completedSteps,
        percent: updated.percent,
        timestamp: updated.updatedAt
      }
    ].slice(-100);
    this.saveProgress(updated);
    return updated;
  }

  complete(goalId = "", note = "goal completed") {
    const current = this.getProgress(goalId);
    return this.update(goalId, {
      status: "completed",
      completedSteps: Number(current?.totalSteps || current?.completedSteps || 0),
      percent: 100,
      note
    });
  }

  getProgress(goalId = "") {
    return this.load().progress[goalId] || null;
  }

  saveProgress(progress = {}) {
    const data = this.load();
    data.progress[progress.goalId] = progress;
    this.writeJson(this.progressFile, { progress: data.progress });
  }

  load() {
    return this.readJson(this.progressFile, { progress: {} });
  }

  ensureStore() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.progressFile)) this.writeJson(this.progressFile, { progress: {} });
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

module.exports = { GoalProgressTracker, DEFAULT_GOAL_ROOT };
