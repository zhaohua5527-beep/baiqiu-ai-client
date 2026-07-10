const fs = require("node:fs");
const path = require("node:path");
const { DEFAULT_EVOLUTION_ROOT } = require("./capability-growth-manager");

function nowIso() {
  return new Date().toISOString();
}

class EvolutionEvaluator {
  constructor({ rootDir = DEFAULT_EVOLUTION_ROOT } = {}) {
    this.rootDir = rootDir;
    this.evaluationsFile = path.join(rootDir, "evaluations.json");
    this.ensureStore();
  }

  evaluate({ identity = null, growth = {}, knowledgeCount = 0, experienceCount = 0, reflectionCount = 0 } = {}) {
    const suggestions = Array.isArray(growth.suggestions) ? growth.suggestions : [];
    const growCount = suggestions.filter((item) => item.action === "grow").length;
    const reviewCount = suggestions.filter((item) => item.action === "review").length;
    const identityScore = identity ? 20 : 0;
    const knowledgeScore = Math.min(25, knowledgeCount * 5);
    const experienceScore = Math.min(25, experienceCount * 5);
    const reflectionScore = Math.min(20, reflectionCount * 5);
    const growthScore = Math.min(10, growCount * 5) - Math.min(10, reviewCount * 3);
    const score = Math.max(0, Math.min(100, identityScore + knowledgeScore + experienceScore + reflectionScore + growthScore));
    const evaluation = {
      score,
      level: score >= 90 ? "mature" : score >= 70 ? "growing" : "collecting",
      dimensions: {
        identityScore,
        knowledgeScore,
        experienceScore,
        reflectionScore,
        growthScore
      },
      recommendation: score >= 90 ? "可生成能力成长建议。" : "继续积累知识、经验与反思样本。",
      timestamp: nowIso()
    };
    this.append(evaluation);
    return evaluation;
  }

  append(item = {}) {
    const data = this.load();
    data.evaluations.push(item);
    this.writeJson(this.evaluationsFile, { evaluations: data.evaluations.slice(-300) });
  }

  load() {
    return this.readJson(this.evaluationsFile, { evaluations: [] });
  }

  ensureStore() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.evaluationsFile)) this.writeJson(this.evaluationsFile, { evaluations: [] });
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

module.exports = { EvolutionEvaluator };
