const fs = require("node:fs");
const path = require("node:path");
const { DEFAULT_LEARNING_ROOT } = require("./learning-priority-engine");

function number(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function nowIso() {
  return new Date().toISOString();
}

class LearningEvaluator {
  constructor({ rootDir = DEFAULT_LEARNING_ROOT, maxResults = 300 } = {}) {
    this.rootDir = rootDir;
    this.resultsFile = path.join(rootDir, "learning-results.json");
    this.maxResults = maxResults;
    this.ensureStore();
  }

  evaluate({ before = {}, after = {}, learningPlan = null } = {}) {
    const successRateBefore = number(before.successRate);
    const successRateAfter = number(after.successRate, successRateBefore);
    const avgDurationBefore = number(before.avgDuration);
    const avgDurationAfter = number(after.avgDuration, avgDurationBefore);
    const recoveryBefore = number(before.recoveryCount);
    const recoveryAfter = number(after.recoveryCount, recoveryBefore);
    const result = {
      successRateBefore,
      successRateAfter,
      successRateChange: successRateAfter - successRateBefore,
      avgDurationBefore,
      avgDurationAfter,
      avgDurationChange: avgDurationAfter - avgDurationBefore,
      recoveryBefore,
      recoveryAfter,
      recoveryChange: recoveryAfter - recoveryBefore,
      status: this.status(successRateAfter - successRateBefore, avgDurationAfter - avgDurationBefore, recoveryAfter - recoveryBefore),
      learningPlanId: learningPlan?.learningPlanId || "",
      timestamp: nowIso(),
      safety: this.safety()
    };
    this.append(result);
    return result;
  }

  status(successRateChange, avgDurationChange, recoveryChange) {
    if (successRateChange > 0 || avgDurationChange < 0 || recoveryChange > 0) return "improved";
    if (successRateChange < 0 || avgDurationChange > 0) return "declined";
    return "stable";
  }

  append(item = {}) {
    const data = this.load();
    data.results.push(item);
    this.writeJson(this.resultsFile, { results: data.results.slice(-this.maxResults) });
  }

  load() {
    return this.readJson(this.resultsFile, { results: [] });
  }

  safety() {
    return {
      evaluationOnly: true,
      advisoryOnly: true,
      executesTool: false,
      modifiesPermission: false,
      bypassesToolSelector: false,
      bypassesVerifierCenter: false
    };
  }

  ensureStore() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.resultsFile)) this.writeJson(this.resultsFile, { results: [] });
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

module.exports = { LearningEvaluator };
