const fs = require("node:fs");
const path = require("node:path");
const { DEFAULT_SELF_AWARENESS_ROOT } = require("./self-awareness-memory");

function nowIso() {
  return new Date().toISOString();
}

class LimitationDetector {
  constructor({ rootDir = DEFAULT_SELF_AWARENESS_ROOT } = {}) {
    this.rootDir = rootDir;
    this.filePath = path.join(rootDir, "limitations.json");
    this.ensureStore();
  }

  detect({ state = null, capability = null, goal = null, strategy = null, decision = null, reflection = null, evolution = null } = {}) {
    const limitations = [];
    for (const missing of capability?.missing || []) {
      limitations.push({
        type: "missing_capability",
        severity: "high",
        detail: missing,
        suggestion: "request capability installation or choose a supported path"
      });
    }
    if (goal?.conflicts?.hasConflict) {
      limitations.push({
        type: "goal_conflict",
        severity: "medium",
        detail: goal.conflicts.recommendation,
        suggestion: "resolve or merge conflicting goals before pursuit"
      });
    }
    if (state?.status === "uncertain") {
      limitations.push({
        type: "low_confidence_state",
        severity: "medium",
        detail: "strategy and decision confidence are both low",
        suggestion: "ask for clarification or gather more context"
      });
    }
    if (!reflection?.available && Number(strategy?.analysis?.score || 0) < 0.4) {
      limitations.push({
        type: "no_reflection_hint",
        severity: "low",
        detail: "no reflection hint is available for a weak strategy",
        suggestion: "record future reflection after verified outcome"
      });
    }
    if (!evolution?.recommendations?.length && Number(decision?.decision?.score || 0) < 0.4) {
      limitations.push({
        type: "no_evolution_advice",
        severity: "low",
        detail: "no evolution advice is available for weak decision analysis",
        suggestion: "continue gathering successful outcomes"
      });
    }
    const result = {
      limitationId: `limitation-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      limitations,
      hasLimitation: limitations.length > 0,
      highestSeverity: limitations.some((item) => item.severity === "high") ? "high" : limitations.some((item) => item.severity === "medium") ? "medium" : limitations.length ? "low" : "none",
      timestamp: nowIso(),
      safety: this.safety()
    };
    this.writeJson(this.filePath, result);
    return result;
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
    if (!fs.existsSync(this.filePath)) this.writeJson(this.filePath, { limitations: [], safety: this.safety() });
  }

  writeJson(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  }
}

module.exports = { LimitationDetector };
