const fs = require("node:fs");
const path = require("node:path");
const { DEFAULT_EVOLUTION_ROOT } = require("./capability-growth-manager");

function nowIso() {
  return new Date().toISOString();
}

class VersionEvolutionManager {
  constructor({ rootDir = DEFAULT_EVOLUTION_ROOT } = {}) {
    this.rootDir = rootDir;
    this.versionFile = path.join(rootDir, "version-evolution.json");
    this.ensureStore();
  }

  propose({ currentVersion = "unknown", growth = {}, evaluation = {}, agentId = "default-agent" } = {}) {
    const growthSuggestions = Array.isArray(growth.suggestions) ? growth.suggestions : [];
    const strongGrowth = growthSuggestions.filter((item) => item.action === "grow").length;
    const reviewCount = growthSuggestions.filter((item) => item.action === "review").length;
    const score = Number(evaluation.score || 0);
    const recommendation = score >= 90 && strongGrowth > 0
      ? "建议进入小版本能力强化评估。"
      : reviewCount > 0
        ? "建议先修复低成功率能力，再考虑版本演进。"
        : "建议保持当前版本并继续收集样本。";
    const proposal = {
      agentId,
      currentVersion,
      recommendedVersionType: score >= 90 && strongGrowth > 0 ? "minor" : "patch",
      recommendation,
      reason: {
        score,
        strongGrowth,
        reviewCount
      },
      safety: {
        modifiesPermission: false,
        bypassesToolSelector: false,
        bypassesVerifierCenter: false
      },
      timestamp: nowIso()
    };
    this.append(proposal);
    return proposal;
  }

  append(item = {}) {
    const data = this.load();
    data.versions.push(item);
    this.writeJson(this.versionFile, { versions: data.versions.slice(-200) });
  }

  load() {
    return this.readJson(this.versionFile, { versions: [] });
  }

  ensureStore() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.versionFile)) this.writeJson(this.versionFile, { versions: [] });
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

module.exports = { VersionEvolutionManager };
