const fs = require("node:fs");
const path = require("node:path");
const { KnowledgeCenter } = require("../knowledge/knowledge-center");
const { WorkflowEngine } = require("../workflow/workflow-engine");
const { ReflectionMemory } = require("../reflection/reflection-memory");
const { DEFAULT_SKILL_ECOSYSTEM_ROOT } = require("./skill-registry");

function nowIso() {
  return new Date().toISOString();
}

function normalize(value = "") {
  return String(value || "").trim().toLowerCase();
}

class SkillDiscovery {
  constructor({ rootDir = DEFAULT_SKILL_ECOSYSTEM_ROOT, skillRegistry = null, knowledgeCenter = null, workflowEngine = null, reflectionMemory = null } = {}) {
    this.rootDir = rootDir;
    this.discoveryFile = path.join(rootDir, "skill-discovery.json");
    this.skillRegistry = skillRegistry;
    this.knowledgeCenter = knowledgeCenter || new KnowledgeCenter();
    this.workflowEngine = workflowEngine || new WorkflowEngine();
    this.reflectionMemory = reflectionMemory || new ReflectionMemory();
    this.ensureStore();
  }

  discover({ taskType = "", keyword = "", workflowTaskType = "" } = {}) {
    const registryMatches = this.skillRegistry ? this.skillRegistry.query({ taskType, keyword }) : [];
    const knowledgeMatches = this.knowledgeCenter.queryKnowledge({ taskType: taskType || workflowTaskType, type: "skill" });
    const workflowMatches = Object.values(this.workflowEngine.load().workflows || {})
      .filter((workflow) => !workflowTaskType || workflow.taskType === workflowTaskType)
      .map((workflow) => ({
        workflowId: workflow.workflowId,
        taskType: workflow.taskType,
        status: workflow.status
      }));
    const reflectionHints = this.reflectionMemory.getHints({ taskType });
    const result = {
      discoveryId: `skill-discovery-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      taskType,
      keyword,
      registryMatches,
      knowledgeMatches,
      workflowMatches,
      reflectionHints,
      recommendations: this.recommend({ registryMatches, knowledgeMatches, reflectionHints }),
      safety: this.safety(),
      timestamp: nowIso()
    };
    this.append(result);
    return result;
  }

  recommend({ registryMatches = [], knowledgeMatches = [], reflectionHints = {} } = {}) {
    const recommendations = [];
    for (const skill of registryMatches) {
      recommendations.push({
        skillId: skill.skillId,
        name: skill.name,
        reason: "registered skill matches requested task",
        score: skill.status === "installed" ? 90 : 60
      });
    }
    for (const item of knowledgeMatches) {
      const exists = recommendations.some((rec) => normalize(rec.skillId) === normalize(item.skill || item.capability));
      if (!exists) {
        recommendations.push({
          skillId: item.skill || item.capability || item.id,
          name: item.skill || item.capability || item.source || item.id,
          reason: "knowledge center has related skill knowledge",
          score: Math.round(Number(item.successRate || 0) * 100)
        });
      }
    }
    if (reflectionHints.available) {
      recommendations.push({
        skillId: "reflection_hint",
        name: "Reflection Improvement Hint",
        reason: reflectionHints.suggestion,
        score: Math.round(Number(reflectionHints.confidence || 0) * 80)
      });
    }
    return recommendations.sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
  }

  append(item = {}) {
    const data = this.load();
    data.discoveries.push(item);
    this.writeJson(this.discoveryFile, { discoveries: data.discoveries.slice(-300) });
  }

  load() {
    return this.readJson(this.discoveryFile, { discoveries: [] });
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
    if (!fs.existsSync(this.discoveryFile)) this.writeJson(this.discoveryFile, { discoveries: [] });
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

module.exports = { SkillDiscovery };
