const fs = require("node:fs");
const path = require("node:path");
const { DEFAULT_IDENTITY_ROOT } = require("./agent-profile-manager");
const { ExperienceCenter } = require("../experience/experience-center");
const { KnowledgeCenter } = require("../knowledge/knowledge-center");
const { ReflectionMemory } = require("../reflection/reflection-memory");

function nowIso() {
  return new Date().toISOString();
}

class AgentContinuityMemory {
  constructor({ rootDir = DEFAULT_IDENTITY_ROOT, experienceCenter = null, knowledgeCenter = null, reflectionMemory = null } = {}) {
    this.rootDir = rootDir;
    this.filePath = path.join(rootDir, "continuity.json");
    this.experienceCenter = experienceCenter || new ExperienceCenter();
    this.knowledgeCenter = knowledgeCenter || new KnowledgeCenter();
    this.reflectionMemory = reflectionMemory || new ReflectionMemory();
    this.ensureStore();
  }

  buildSnapshot(agentId = "default-agent") {
    const experiences = this.experienceCenter.list?.() || [];
    const knowledge = this.knowledgeCenter.loadKnowledge?.().items || [];
    const reflections = this.reflectionMemory.loadReflections?.().reflections || [];
    const improvements = this.reflectionMemory.loadImprovements?.().improvements || [];
    return {
      agentId,
      experienceCount: experiences.length,
      knowledgeCount: knowledge.length,
      reflectionCount: reflections.length,
      improvementCount: improvements.length,
      recentExperience: experiences.slice(-5),
      recentKnowledge: knowledge.slice(-5),
      recentReflections: reflections.slice(-5),
      recentImprovements: improvements.slice(-5),
      updatedAt: nowIso()
    };
  }

  saveSnapshot(agentId = "default-agent") {
    const snapshot = this.buildSnapshot(agentId);
    const data = this.load();
    data.memories[agentId] = snapshot;
    this.save(data);
    return snapshot;
  }

  getSnapshot(agentId = "default-agent") {
    return this.load().memories[agentId] || null;
  }

  getContinuityPrompt(agentId = "default-agent") {
    const snapshot = this.getSnapshot(agentId) || this.saveSnapshot(agentId);
    const lines = [
      `Agent: ${snapshot.agentId}`,
      `Experience: ${snapshot.experienceCount}`,
      `Knowledge: ${snapshot.knowledgeCount}`,
      `Reflection: ${snapshot.reflectionCount}`,
      `Improvements: ${snapshot.improvementCount}`
    ];
    for (const item of snapshot.recentImprovements || []) {
      if (item.improvement) lines.push(`Improvement: ${item.improvement}`);
    }
    return lines.join("\n");
  }

  ensureStore() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.filePath)) this.save({ memories: {} });
  }

  load() {
    this.ensureStore();
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      return { memories: parsed.memories && typeof parsed.memories === "object" ? parsed.memories : {} };
    } catch {
      return { memories: {} };
    }
  }

  save(data = {}) {
    fs.mkdirSync(this.rootDir, { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify({ memories: data.memories || {} }, null, 2), "utf8");
  }
}

module.exports = { AgentContinuityMemory };
