const fs = require("node:fs");
const path = require("node:path");
const { ShortTermMemory, DEFAULT_MEMORY_ARCHITECTURE_ROOT } = require("./short-term-memory");
const { LongTermMemory } = require("./long-term-memory");
const { EpisodicMemory } = require("./episodic-memory");
const { SemanticMemory } = require("./semantic-memory");
const { MemoryRetriever } = require("./memory-retriever");
const { AgentContinuityMemory } = require("../identity/agent-continuity-memory");
const { KnowledgeCenter } = require("../knowledge/knowledge-center");
const { ExperienceCenter } = require("../experience/experience-center");
const { ReflectionMemory } = require("../reflection/reflection-memory");
const { SkillRegistry } = require("../skill-ecosystem/skill-registry");
const { GoalManager } = require("../goal/goal-manager");

function nowIso() {
  return new Date().toISOString();
}

class MemoryCore {
  constructor({
    rootDir = DEFAULT_MEMORY_ARCHITECTURE_ROOT,
    shortTermMemory = null,
    longTermMemory = null,
    episodicMemory = null,
    semanticMemory = null,
    memoryRetriever = null,
    identityMemory = null,
    knowledgeCenter = null,
    experienceCenter = null,
    reflectionMemory = null,
    skillRegistry = null,
    goalManager = null
  } = {}) {
    this.rootDir = rootDir;
    this.coreFile = path.join(rootDir, "memory-core.json");
    this.shortTermMemory = shortTermMemory || new ShortTermMemory({ rootDir });
    this.longTermMemory = longTermMemory || new LongTermMemory({ rootDir });
    this.episodicMemory = episodicMemory || new EpisodicMemory({ rootDir });
    this.semanticMemory = semanticMemory || new SemanticMemory({ rootDir });
    this.memoryRetriever = memoryRetriever || new MemoryRetriever({
      rootDir,
      shortTermMemory: this.shortTermMemory,
      longTermMemory: this.longTermMemory,
      episodicMemory: this.episodicMemory,
      semanticMemory: this.semanticMemory
    });
    this.identityMemory = identityMemory || new AgentContinuityMemory();
    this.knowledgeCenter = knowledgeCenter || new KnowledgeCenter();
    this.experienceCenter = experienceCenter || new ExperienceCenter({ knowledgeCenter: this.knowledgeCenter });
    this.reflectionMemory = reflectionMemory || new ReflectionMemory();
    this.skillRegistry = skillRegistry || new SkillRegistry();
    this.goalManager = goalManager || new GoalManager();
    this.ensureStore();
  }

  remember(input = {}) {
    const scope = input.scope || input.memoryType || "short_term";
    if (scope === "long_term") return this.longTermMemory.rememberFact(input);
    if (scope === "episodic") return this.episodicMemory.recordEpisode(input);
    if (scope === "semantic") return this.semanticMemory.addConcept(input);
    return this.shortTermMemory.remember(input);
  }

  retrieve(query = {}) {
    return this.memoryRetriever.retrieve(query);
  }

  syncExternalMemory({ agentId = "default-agent" } = {}) {
    const imported = {
      identity: 0,
      knowledge: 0,
      experience: 0,
      reflection: 0,
      skill: 0,
      goal: 0
    };

    const identitySnapshot = this.identityMemory.saveSnapshot?.(agentId) || this.identityMemory.getSnapshot?.(agentId);
    if (identitySnapshot) {
      const item = this.longTermMemory.rememberFact({
        type: "identity_continuity",
        source: "AgentContinuityMemory",
        content: `agent=${identitySnapshot.agentId}; experience=${identitySnapshot.experienceCount}; knowledge=${identitySnapshot.knowledgeCount}; reflection=${identitySnapshot.reflectionCount}`,
        tags: ["identity", "continuity"],
        confidence: 0.9
      });
      if (item) imported.identity += 1;
    }

    for (const item of this.knowledgeCenter.loadKnowledge?.().items || []) {
      const concept = this.semanticMemory.addConcept({
        type: "knowledge",
        source: "KnowledgeCenter",
        taskType: item.taskType,
        concept: item.capability || item.skill || item.toolId || item.type,
        content: item.result || item.experience || item.source,
        tags: [item.toolId, item.type].filter(Boolean),
        confidence: Number(item.successRate || 0.75)
      });
      if (concept) imported.knowledge += 1;
    }

    for (const exp of this.experienceCenter.list?.() || []) {
      const episode = this.episodicMemory.recordEpisode({
        type: "experience",
        source: "ExperienceCenter",
        taskType: exp.taskType,
        content: `${exp.errorType || "task"} -> ${exp.solution || ""}`,
        result: exp.solution,
        success: exp.success === true,
        tags: [exp.toolId, exp.errorType].filter(Boolean),
        confidence: 0.86
      });
      if (episode) imported.experience += 1;
    }

    for (const reflection of this.reflectionMemory.loadReflections?.().reflections || []) {
      const episode = this.episodicMemory.recordEpisode({
        type: "reflection",
        source: "ReflectionMemory",
        taskType: reflection.taskType,
        content: reflection.improvement || reflection.reason || reflection.mistake,
        result: reflection.status,
        success: reflection.status === "success",
        tags: ["reflection", reflection.mistake].filter(Boolean),
        confidence: Number(reflection.confidence || 0.75)
      });
      if (episode) imported.reflection += 1;
    }

    for (const skill of this.skillRegistry.listSkills?.() || []) {
      const concept = this.semanticMemory.addConcept({
        type: "skill",
        source: "SkillRegistry",
        taskType: (skill.taskTypes || [])[0] || "",
        concept: skill.name || skill.skillId,
        content: skill.description || skill.status,
        relations: [...(skill.capabilities || []), ...(skill.tools || [])],
        tags: ["skill", skill.status].filter(Boolean),
        confidence: skill.status === "installed" || skill.status === "registered" ? 0.82 : 0.5
      });
      if (concept) imported.skill += 1;
    }

    for (const goal of this.goalManager.listGoals?.() || []) {
      const item = this.shortTermMemory.remember({
        type: "goal",
        source: "GoalManager",
        taskType: goal.taskType,
        content: goal.goal || goal.sourceInput || goal.intent,
        tags: ["goal", goal.status].filter(Boolean),
        confidence: Number(goal.confidence || 0.7)
      });
      if (item) imported.goal += 1;
    }

    const snapshot = this.buildMemorySnapshot({ agentId, imported });
    this.writeJson(this.coreFile, snapshot);
    return snapshot;
  }

  buildMemorySnapshot({ agentId = "default-agent", imported = null } = {}) {
    return {
      agentId,
      layers: {
        shortTerm: this.shortTermMemory.load().items.length,
        longTerm: this.longTermMemory.load().items.length,
        episodic: this.episodicMemory.load().items.length,
        semantic: this.semanticMemory.load().items.length
      },
      connectedSystems: ["Identity", "Knowledge", "Experience", "Reflection", "Skill", "Goal"],
      imported,
      updatedAt: nowIso(),
      safety: this.safety()
    };
  }

  getSnapshot() {
    return this.readJson(this.coreFile, this.buildMemorySnapshot());
  }

  safety() {
    return {
      memoryOnly: true,
      executesTool: false,
      bypassesToolSelector: false,
      bypassesVerifierCenter: false
    };
  }

  ensureStore() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.coreFile)) this.writeJson(this.coreFile, this.buildMemorySnapshot());
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

module.exports = { MemoryCore, DEFAULT_MEMORY_ARCHITECTURE_ROOT };
