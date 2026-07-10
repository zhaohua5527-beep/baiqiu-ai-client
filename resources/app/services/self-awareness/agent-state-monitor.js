const fs = require("node:fs");
const path = require("node:path");
const { DEFAULT_SELF_AWARENESS_ROOT } = require("./self-awareness-memory");

function nowIso() {
  return new Date().toISOString();
}

class AgentStateMonitor {
  constructor({ rootDir = DEFAULT_SELF_AWARENESS_ROOT } = {}) {
    this.rootDir = rootDir;
    this.filePath = path.join(rootDir, "agent-state.json");
    this.ensureStore();
  }

  observe({ goal = null, strategy = null, decision = null, memory = null, reflection = null, evolution = null } = {}) {
    const activeGoal = goal?.pursuit?.selectedGoal || null;
    const state = {
      stateId: `agent-state-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      currentGoal: activeGoal?.goal || activeGoal?.sourceInput || activeGoal?.intent || "",
      goalScore: Number(goal?.score || goal?.pursuit?.pursuitScore || 0),
      strategyScore: Number(strategy?.analysis?.score || strategy?.score || 0),
      decisionScore: Number(decision?.decision?.score || decision?.score || 0),
      memorySignals: Number(memory?.memories?.length || 0),
      reflectionAvailable: Boolean(reflection?.available),
      evolutionAdviceCount: Number(evolution?.recommendations?.length || 0),
      status: this.inferStatus({ goal, strategy, decision }),
      timestamp: nowIso(),
      safety: this.safety()
    };
    this.writeJson(this.filePath, state);
    return state;
  }

  inferStatus({ goal = null, strategy = null, decision = null } = {}) {
    if (goal?.conflicts?.hasConflict) return "needs_attention";
    if (Number(strategy?.analysis?.score || 0) <= 0 && Number(decision?.decision?.score || 0) <= 0) return "uncertain";
    if (goal?.pursuit?.selectedGoal) return "goal_focused";
    return "idle";
  }

  safety() {
    return {
      selfAwarenessOnly: true,
      executesTool: false,
      bypassesToolSelector: false,
      bypassesVerifierCenter: false
    };
  }

  ensureStore() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.filePath)) this.writeJson(this.filePath, { status: "idle", safety: this.safety() });
  }

  writeJson(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  }
}

module.exports = { AgentStateMonitor };
