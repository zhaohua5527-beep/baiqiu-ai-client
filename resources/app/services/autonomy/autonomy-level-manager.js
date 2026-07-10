const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_AUTONOMY_ROOT = path.join("D:\\BaiQiuAI", "data", "autonomy");
const DEFAULT_LEVELS = Object.freeze({
  manual: {
    level: "manual",
    score: 0,
    description: "Human approval required for all executable actions.",
    allowToolExecution: false,
    requireConfirmRisk: ["low", "medium", "high"]
  },
  assisted: {
    level: "assisted",
    score: 1,
    description: "Low risk actions may be planned, risky actions require approval.",
    allowToolExecution: false,
    requireConfirmRisk: ["medium", "high"]
  },
  supervised: {
    level: "supervised",
    score: 2,
    description: "Normal actions can be recommended, high risk requires approval.",
    allowToolExecution: false,
    requireConfirmRisk: ["high"]
  },
  autonomous: {
    level: "autonomous",
    score: 3,
    description: "Broad planning autonomy, core safety gates remain mandatory.",
    allowToolExecution: false,
    requireConfirmRisk: ["high"]
  }
});

function nowIso() {
  return new Date().toISOString();
}

class AutonomyLevelManager {
  constructor({ rootDir = DEFAULT_AUTONOMY_ROOT } = {}) {
    this.rootDir = rootDir;
    this.levelsFile = path.join(rootDir, "autonomy-levels.json");
    this.ensureStore();
  }

  setLevel(agentId = "default-agent", level = "assisted", reason = "") {
    const profile = DEFAULT_LEVELS[level] || DEFAULT_LEVELS.assisted;
    const data = this.load();
    const record = {
      agentId,
      ...profile,
      reason,
      updatedAt: nowIso()
    };
    data.levels[agentId] = record;
    this.writeJson(this.levelsFile, { levels: data.levels });
    return record;
  }

  getLevel(agentId = "default-agent") {
    const data = this.load();
    return data.levels[agentId] || this.setLevel(agentId, "assisted", "default");
  }

  recommendLevel({ identity = null, evolution = null, adaptation = null, policy = {} } = {}) {
    const hasIdentity = Boolean(identity);
    const evolutionScore = Number(evolution?.evaluation?.score || evolution?.score || 0);
    const hasAdaptation = Boolean(adaptation?.selectedStrategy || adaptation?.adaptation?.selectedStrategy);
    if (policy.highRiskRequireConfirm === false) return "assisted";
    if (hasIdentity && evolutionScore >= 90 && hasAdaptation) return "supervised";
    if (hasIdentity && evolutionScore >= 70) return "assisted";
    return "manual";
  }

  listLevels() {
    return Object.values(this.load().levels);
  }

  load() {
    return this.readJson(this.levelsFile, { levels: {} });
  }

  ensureStore() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.levelsFile)) this.writeJson(this.levelsFile, { levels: {} });
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

module.exports = { AutonomyLevelManager, DEFAULT_AUTONOMY_ROOT, DEFAULT_LEVELS };
