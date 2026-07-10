const fs = require("node:fs");
const path = require("node:path");
const { DEFAULT_GOAL_INTELLIGENCE_ROOT } = require("./goal-memory");

function nowIso() {
  return new Date().toISOString();
}

class GoalPursuitEngine {
  constructor({ rootDir = DEFAULT_GOAL_INTELLIGENCE_ROOT } = {}) {
    this.rootDir = rootDir;
    this.filePath = path.join(rootDir, "goal-pursuit.json");
    this.ensureStore();
  }

  pursue({ goals = [], strategy = null, decision = null, attention = null, reasoning = null } = {}) {
    const ranked = [...goals].sort((a, b) => {
      const aScore = Number(a.priorityScore || a.confidence || 0);
      const bScore = Number(b.priorityScore || b.confidence || 0);
      return bScore - aScore;
    });
    const selectedGoal = ranked[0] || null;
    const strategyScore = Number(strategy?.analysis?.score || strategy?.score || 0);
    const decisionScore = Number(decision?.decision?.score || decision?.score || 0);
    const attentionScore = Number(attention?.selection?.selected?.[0]?.attentionScore || 0);
    const reasoningScore = Number(reasoning?.confidence || 0);
    const pursuitScore = Math.min(1.5, Number(selectedGoal?.confidence || 0.5) * 0.35 + strategyScore * 0.25 + decisionScore * 0.18 + attentionScore * 0.12 + reasoningScore * 0.1);
    const result = {
      pursuitId: `goal-pursuit-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      selectedGoal,
      rankedGoals: ranked,
      pursuitScore: Number(pursuitScore.toFixed(4)),
      recommendation: selectedGoal ? `pursue:${selectedGoal.goal || selectedGoal.sourceInput || selectedGoal.intent || selectedGoal.goalId}` : "no active goal",
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
    if (!fs.existsSync(this.filePath)) this.writeJson(this.filePath, { selectedGoal: null, safety: this.safety() });
  }

  writeJson(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  }
}

module.exports = { GoalPursuitEngine };
