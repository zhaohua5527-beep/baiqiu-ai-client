const fs = require("node:fs");
const path = require("node:path");
const { KnowledgeCenter } = require("../knowledge/knowledge-center");
const { WorkflowEngine } = require("../workflow/workflow-engine");
const { ReflectionMemory } = require("../reflection/reflection-memory");
const { AgentEvolutionEngine } = require("../evolution/agent-evolution-engine");
const { SkillRegistry, DEFAULT_SKILL_ECOSYSTEM_ROOT } = require("./skill-registry");
const { SkillDiscovery } = require("./skill-discovery");
const { SkillVersionManager } = require("./skill-version-manager");
const { SkillEvaluator } = require("./skill-evaluator");

function nowIso() {
  return new Date().toISOString();
}

class SkillManager {
  constructor({
    rootDir = DEFAULT_SKILL_ECOSYSTEM_ROOT,
    registry = null,
    discovery = null,
    versionManager = null,
    evaluator = null,
    knowledgeCenter = null,
    workflowEngine = null,
    reflectionMemory = null,
    evolutionEngine = null
  } = {}) {
    this.rootDir = rootDir;
    this.managerFile = path.join(rootDir, "skill-manager.json");
    this.knowledgeCenter = knowledgeCenter || new KnowledgeCenter();
    this.workflowEngine = workflowEngine || new WorkflowEngine();
    this.reflectionMemory = reflectionMemory || new ReflectionMemory();
    this.evolutionEngine = evolutionEngine || new AgentEvolutionEngine({ knowledgeCenter: this.knowledgeCenter, reflectionMemory: this.reflectionMemory });
    this.registry = registry || new SkillRegistry({ rootDir });
    this.versionManager = versionManager || new SkillVersionManager({ rootDir });
    this.discovery = discovery || new SkillDiscovery({ rootDir, skillRegistry: this.registry, knowledgeCenter: this.knowledgeCenter, workflowEngine: this.workflowEngine, reflectionMemory: this.reflectionMemory });
    this.evaluator = evaluator || new SkillEvaluator({ rootDir, knowledgeCenter: this.knowledgeCenter, reflectionMemory: this.reflectionMemory, evolutionEngine: this.evolutionEngine });
    this.ensureStore();
  }

  registerSkill(input = {}, { agentId = "default-agent" } = {}) {
    const skill = this.registry.register(input);
    const version = this.versionManager.createVersion(skill, { changes: "registered through skill manager" });
    const evaluation = this.evaluator.evaluate({ ...skill, version: version.version }, { agentId });
    this.syncKnowledge(skill, evaluation);
    const event = {
      eventId: `skill-event-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      event: "skill_registered",
      skillId: skill.skillId,
      version: version.version,
      evaluationStatus: evaluation.status,
      safety: this.safety(),
      timestamp: nowIso()
    };
    this.append(event);
    return { skill, version, evaluation, event };
  }

  discoverSkills(query = {}) {
    return this.discovery.discover(query);
  }

  evaluateSkill(skillId = "", options = {}) {
    const skill = this.registry.getSkill(skillId);
    if (!skill) return null;
    return this.evaluator.evaluate(skill, options);
  }

  syncKnowledge(skill = {}, evaluation = {}) {
    return this.knowledgeCenter.addKnowledge({
      type: "skill",
      source: skill.description || skill.name || "",
      taskType: (skill.taskTypes || [])[0] || "",
      capability: (skill.capabilities || [])[0] || "",
      skill: skill.skillId,
      result: evaluation.status || skill.status,
      successRate: Number(evaluation.score || 0) / 100,
      successCount: evaluation.status === "healthy" ? 1 : 0,
      failCount: evaluation.status === "weak" ? 1 : 0
    });
  }

  append(event = {}) {
    const data = this.load();
    data.events.push(event);
    this.writeJson(this.managerFile, { events: data.events.slice(-500) });
  }

  load() {
    return this.readJson(this.managerFile, { events: [] });
  }

  safety() {
    return {
      skillManagementOnly: true,
      executesTool: false,
      bypassesToolSelector: false,
      bypassesVerifierCenter: false
    };
  }

  ensureStore() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.managerFile)) this.writeJson(this.managerFile, { events: [] });
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

module.exports = { SkillManager };
