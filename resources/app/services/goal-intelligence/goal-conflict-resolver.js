const fs = require("node:fs");
const path = require("node:path");
const { DEFAULT_GOAL_INTELLIGENCE_ROOT } = require("./goal-memory");

function nowIso() {
  return new Date().toISOString();
}

class GoalConflictResolver {
  constructor({ rootDir = DEFAULT_GOAL_INTELLIGENCE_ROOT } = {}) {
    this.rootDir = rootDir;
    this.filePath = path.join(rootDir, "goal-conflicts.json");
    this.ensureStore();
  }

  resolve(goals = []) {
    const conflicts = [];
    for (let i = 0; i < goals.length; i += 1) {
      for (let j = i + 1; j < goals.length; j += 1) {
        const a = goals[i] || {};
        const b = goals[j] || {};
        const sameTask = a.taskType && b.taskType && a.taskType === b.taskType;
        const highRiskMix = a.riskLevel === "high" || b.riskLevel === "high";
        const bothActive = a.status === "active" && b.status === "active";
        if (bothActive && sameTask) {
          conflicts.push({
            type: "duplicate_active_goal",
            goals: [a.goalId || a.goal || "", b.goalId || b.goal || ""],
            severity: "medium",
            suggestion: "prioritize higher confidence or merge duplicate active goals"
          });
        }
        if (bothActive && highRiskMix && a.riskLevel !== b.riskLevel) {
          conflicts.push({
            type: "risk_priority_conflict",
            goals: [a.goalId || a.goal || "", b.goalId || b.goal || ""],
            severity: "high",
            suggestion: "separate high risk goal for explicit confirmation before pursuit"
          });
        }
      }
    }
    const result = {
      conflictId: `goal-conflict-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      conflicts,
      hasConflict: conflicts.length > 0,
      recommendation: conflicts.length ? conflicts[0].suggestion : "no conflict detected",
      timestamp: nowIso(),
      safety: this.safety()
    };
    this.writeJson(this.filePath, result);
    return result;
  }

  safety() {
    return {
      goalIntelligenceOnly: true,
      executesTool: false,
      bypassesToolSelector: false,
      bypassesVerifierCenter: false
    };
  }

  ensureStore() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.filePath)) this.writeJson(this.filePath, { conflicts: [], safety: this.safety() });
  }

  writeJson(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  }
}

module.exports = { GoalConflictResolver };
