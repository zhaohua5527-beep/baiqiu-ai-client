const fs = require("node:fs");
const path = require("node:path");
const { DEFAULT_GOAL_INTELLIGENCE_ROOT } = require("./goal-memory");

function nowIso() {
  return new Date().toISOString();
}

class GoalAdaptationEngine {
  constructor({ rootDir = DEFAULT_GOAL_INTELLIGENCE_ROOT } = {}) {
    this.rootDir = rootDir;
    this.filePath = path.join(rootDir, "goal-adaptation.json");
    this.ensureStore();
  }

  adapt({ pursuit = null, conflicts = null, reflection = null, evolution = null, memory = null, context = null } = {}) {
    const suggestions = [];
    if (conflicts?.hasConflict) {
      suggestions.push({
        type: "resolve_conflict",
        suggestion: conflicts.recommendation,
        confidence: conflicts.conflicts?.some((item) => item.severity === "high") ? 0.9 : 0.75
      });
    }
    if (reflection?.available) {
      suggestions.push({
        type: "use_reflection",
        suggestion: reflection.suggestion,
        confidence: Number(reflection.confidence || 0.75)
      });
    }
    for (const item of evolution?.recommendations || []) {
      suggestions.push({
        type: "use_evolution",
        suggestion: item.suggestion || item.type || "",
        confidence: Number(item.confidence || 0.6)
      });
    }
    if (memory?.memories?.length) {
      suggestions.push({
        type: "use_memory",
        suggestion: "reuse relevant memory when refining goal pursuit",
        confidence: 0.7
      });
    }
    if (context?.truncated) {
      suggestions.push({
        type: "narrow_context",
        suggestion: "reduce goal scope to fit current context window",
        confidence: 0.65
      });
    }
    const best = suggestions.sort((a, b) => b.confidence - a.confidence)[0] || null;
    const result = {
      adaptationId: `goal-adapt-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      pursuitId: pursuit?.pursuitId || "",
      suggestions,
      recommendation: best?.suggestion || pursuit?.recommendation || "continue current goal pursuit",
      confidence: Number(best?.confidence || pursuit?.pursuitScore || 0.5),
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
    if (!fs.existsSync(this.filePath)) this.writeJson(this.filePath, { suggestions: [], safety: this.safety() });
  }

  writeJson(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  }
}

module.exports = { GoalAdaptationEngine };
