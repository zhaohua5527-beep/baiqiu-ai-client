const fs = require("node:fs");
const path = require("node:path");
const { DEFAULT_SELF_IMPROVEMENT_ROOT } = require("./improvement-memory");

function nowIso() {
  return new Date().toISOString();
}

class ImprovementEvaluator {
  constructor({ rootDir = DEFAULT_SELF_IMPROVEMENT_ROOT } = {}) {
    this.rootDir = rootDir;
    this.filePath = path.join(rootDir, "improvement-evaluation.json");
    this.ensureStore();
  }

  evaluate({ before = null, after = null, analysis = null, plan = null } = {}) {
    const successRateChange = Number(after?.successRate || 0) - Number(before?.successRate || 0);
    const avgDurationChange = Number(before?.avgDuration || 0) - Number(after?.avgDuration || 0);
    const failureReduction = Number(before?.failCount || 0) - Number(after?.failCount || 0);
    const recoveryImprovement = Number(after?.recoveryCount || 0) - Number(before?.recoveryCount || 0);
    const hintCount = Array.isArray(plan?.hints) ? plan.hints.length : 0;
    const issueCount = Number((analysis?.highFrequencyFailures || []).length + (analysis?.lowPerformance || []).length + (analysis?.planningIssues || []).length);
    const score = Math.max(0, Math.min(1, 0.35 + successRateChange * 0.35 + Math.max(0, avgDurationChange / 10000) * 0.15 + Math.max(0, failureReduction) * 0.08 + Math.max(0, recoveryImprovement) * 0.08 + Math.min(0.2, hintCount * 0.03) + Math.min(0.15, issueCount * 0.03)));
    const result = {
      evaluationId: `improve-eval-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      successRateChange,
      avgDurationChange,
      failureReduction,
      recoveryImprovement,
      hintCount,
      issueCount,
      score: Number(score.toFixed(4)),
      status: score >= 0.6 ? "useful" : "observe",
      timestamp: nowIso(),
      safety: this.safety()
    };
    this.writeJson(this.filePath, result);
    return result;
  }

  safety() {
    return {
      selfImprovementOnly: true,
      advisoryOnly: true,
      modifiesPermission: false,
      executesTool: false,
      bypassesToolSelector: false,
      bypassesVerifierCenter: false
    };
  }

  ensureStore() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.filePath)) this.writeJson(this.filePath, { score: 0, safety: this.safety() });
  }

  writeJson(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  }
}

module.exports = { ImprovementEvaluator };
