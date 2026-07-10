const fs = require("node:fs");
const path = require("node:path");
const { DEFAULT_EVOLUTION_NETWORK_ROOT } = require("./evolution-graph");

function n(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function nowIso() {
  return new Date().toISOString();
}

class KnowledgeImpactAnalyzer {
  constructor({ rootDir = DEFAULT_EVOLUTION_NETWORK_ROOT } = {}) {
    this.rootDir = rootDir;
    this.impactFile = path.join(rootDir, "impact-report.json");
    this.ensureStore();
  }

  analyze({ before = {}, after = {}, graph = null, flows = null, taskType = "" } = {}) {
    const successRateChange = n(after.successRate, n(before.successRate)) - n(before.successRate);
    const avgDurationChange = n(after.avgDuration, n(before.avgDuration)) - n(before.avgDuration);
    const errorReduction = n(before.errorCount ?? before.failCount) - n(after.errorCount ?? after.failCount, n(before.errorCount ?? before.failCount));
    const recoveryChange = n(after.recoveryCount, n(before.recoveryCount)) - n(before.recoveryCount);
    const impact = {
      taskType,
      successRateChange,
      avgDurationChange,
      errorReduction,
      recoveryChange,
      graphSize: {
        nodes: graph?.nodes?.length || 0,
        edges: graph?.edges?.length || 0
      },
      flowCount: flows?.flowCount || flows?.flows?.length || 0,
      status: this.status({ successRateChange, avgDurationChange, errorReduction, recoveryChange }),
      timestamp: nowIso(),
      safety: this.safety()
    };
    this.writeJson(this.impactFile, impact);
    return impact;
  }

  status({ successRateChange = 0, avgDurationChange = 0, errorReduction = 0, recoveryChange = 0 } = {}) {
    if (successRateChange > 0 || avgDurationChange < 0 || errorReduction > 0 || recoveryChange > 0) return "positive";
    if (successRateChange < 0 || avgDurationChange > 0 || errorReduction < 0) return "negative";
    return "neutral";
  }

  safety() {
    return {
      analysisOnly: true,
      advisoryOnly: true,
      executesTool: false,
      modifiesPermission: false,
      bypassesToolSelector: false,
      bypassesVerifierCenter: false
    };
  }

  ensureStore() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.impactFile)) this.writeJson(this.impactFile, { status: "neutral", safety: this.safety() });
  }

  writeJson(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  }
}

module.exports = { KnowledgeImpactAnalyzer };
