const fs = require("node:fs");
const path = require("node:path");
const { AgentIdentityCenter } = require("../identity/agent-identity-center");
const { KnowledgeCenter } = require("../knowledge/knowledge-center");
const { ExperienceCenter } = require("../experience/experience-center");
const { ReflectionMemory } = require("../reflection/reflection-memory");
const { CapabilityGrowthManager, DEFAULT_EVOLUTION_ROOT } = require("./capability-growth-manager");
const { VersionEvolutionManager } = require("./version-evolution-manager");
const { EvolutionEvaluator } = require("./evolution-evaluator");

function nowIso() {
  return new Date().toISOString();
}

class AgentEvolutionEngine {
  constructor({
    rootDir = DEFAULT_EVOLUTION_ROOT,
    identityCenter = null,
    knowledgeCenter = null,
    experienceCenter = null,
    reflectionMemory = null,
    capabilityGrowthManager = null,
    versionEvolutionManager = null,
    evolutionEvaluator = null
  } = {}) {
    this.rootDir = rootDir;
    this.evolutionFile = path.join(rootDir, "evolution.json");
    this.identityCenter = identityCenter || new AgentIdentityCenter();
    this.knowledgeCenter = knowledgeCenter || new KnowledgeCenter();
    this.experienceCenter = experienceCenter || new ExperienceCenter({ knowledgeCenter: this.knowledgeCenter });
    this.reflectionMemory = reflectionMemory || new ReflectionMemory();
    this.capabilityGrowthManager = capabilityGrowthManager || new CapabilityGrowthManager({
      rootDir,
      knowledgeCenter: this.knowledgeCenter,
      experienceCenter: this.experienceCenter,
      reflectionMemory: this.reflectionMemory
    });
    this.versionEvolutionManager = versionEvolutionManager || new VersionEvolutionManager({ rootDir });
    this.evolutionEvaluator = evolutionEvaluator || new EvolutionEvaluator({ rootDir });
    this.ensureStore();
  }

  generateEvolutionAdvice({ agentId = "default-agent", taskType = "", currentVersion = "unknown" } = {}) {
    const identity = this.identityCenter.getIdentity(agentId);
    const knowledgeItems = this.knowledgeCenter.queryKnowledge({ taskType });
    const experiences = this.experienceCenter.list().filter((item) => !taskType || item.taskType === taskType);
    const reflections = this.reflectionMemory.loadReflections().reflections.filter((item) => !taskType || item.taskType === taskType);
    const growth = this.capabilityGrowthManager.analyze({ taskType, agentId });
    const evaluation = this.evolutionEvaluator.evaluate({
      identity,
      growth,
      knowledgeCount: knowledgeItems.length,
      experienceCount: experiences.length,
      reflectionCount: reflections.length
    });
    const version = this.versionEvolutionManager.propose({ currentVersion, growth, evaluation, agentId });
    const advice = {
      evolutionId: `evo-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      agentId,
      taskType,
      currentVersion,
      identityKnown: Boolean(identity),
      knowledgeCount: knowledgeItems.length,
      experienceCount: experiences.length,
      reflectionCount: reflections.length,
      growth,
      evaluation,
      version,
      recommendations: this.buildRecommendations(growth, evaluation, version),
      safety: {
        advisoryOnly: true,
        modifiesCorePermission: false,
        bypassesToolSelector: false,
        bypassesVerifierCenter: false
      },
      timestamp: nowIso()
    };
    this.append(advice);
    return advice;
  }

  buildRecommendations(growth = {}, evaluation = {}, version = {}) {
    const suggestions = Array.isArray(growth.suggestions) ? growth.suggestions : [];
    const recommended = suggestions.map((item) => ({
      type: item.action,
      target: item.capability || item.toolId || "general",
      suggestion: item.reason,
      confidence: Number(item.confidence || 0)
    }));
    recommended.push({
      type: "version",
      target: version.recommendedVersionType || "patch",
      suggestion: version.recommendation || "保持当前版本。",
      confidence: Number(evaluation.score || 0) / 100
    });
    return recommended;
  }

  append(item = {}) {
    const data = this.load();
    data.evolutions.push(item);
    this.writeJson(this.evolutionFile, { evolutions: data.evolutions.slice(-200) });
  }

  load() {
    return this.readJson(this.evolutionFile, { evolutions: [] });
  }

  ensureStore() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.evolutionFile)) this.writeJson(this.evolutionFile, { evolutions: [] });
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

module.exports = { AgentEvolutionEngine };
