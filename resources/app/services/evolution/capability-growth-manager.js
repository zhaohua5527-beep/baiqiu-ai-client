const fs = require("node:fs");
const path = require("node:path");
const { dataRoot } = require("../data-root");
const { KnowledgeCenter } = require("../knowledge/knowledge-center");
const { ExperienceCenter } = require("../experience/experience-center");
const { ReflectionMemory } = require("../reflection/reflection-memory");

const DEFAULT_EVOLUTION_ROOT = path.join(dataRoot(), "evolution");

function nowIso() {
  return new Date().toISOString();
}

function normalize(value = "") {
  return String(value || "").trim().toLowerCase();
}

class CapabilityGrowthManager {
  constructor({
    rootDir = DEFAULT_EVOLUTION_ROOT,
    knowledgeCenter = null,
    experienceCenter = null,
    reflectionMemory = null
  } = {}) {
    this.rootDir = rootDir;
    this.growthFile = path.join(rootDir, "capability-growth.json");
    this.knowledgeCenter = knowledgeCenter || new KnowledgeCenter();
    this.experienceCenter = experienceCenter || new ExperienceCenter({ knowledgeCenter: this.knowledgeCenter });
    this.reflectionMemory = reflectionMemory || new ReflectionMemory();
    this.ensureStore();
  }

  analyze({ taskType = "", agentId = "default-agent" } = {}) {
    const knowledge = this.knowledgeCenter.loadKnowledge().items || [];
    const experiences = this.experienceCenter.list();
    const improvements = this.reflectionMemory.loadImprovements().improvements || [];
    const relatedKnowledge = this.filterByTask(knowledge, taskType);
    const relatedExperience = this.filterByTask(experiences, taskType);
    const relatedImprovements = this.filterByTask(improvements, taskType);
    const tools = this.buildToolStats(relatedKnowledge, relatedExperience);
    const suggestions = this.buildSuggestions(tools, relatedImprovements);
    const result = {
      agentId,
      taskType,
      tools,
      suggestions,
      recommendedCapabilities: suggestions.filter((item) => item.action === "grow").map((item) => item.capability),
      timestamp: nowIso()
    };
    this.append(result);
    return result;
  }

  buildToolStats(knowledge = [], experiences = []) {
    const map = new Map();
    for (const item of knowledge) {
      if (!item.toolId) continue;
      const stat = map.get(item.toolId) || {
        toolId: item.toolId,
        capability: item.capability || item.toolId,
        successRate: 0,
        successCount: 0,
        failCount: 0,
        experienceCount: 0
      };
      stat.successRate = Math.max(Number(stat.successRate || 0), Number(item.successRate || 0));
      stat.successCount += Number(item.successCount || 0);
      stat.failCount += Number(item.failCount || 0);
      map.set(item.toolId, stat);
    }
    for (const item of experiences) {
      if (!item.toolId) continue;
      const stat = map.get(item.toolId) || {
        toolId: item.toolId,
        capability: item.toolId,
        successRate: 0,
        successCount: 0,
        failCount: 0,
        experienceCount: 0
      };
      stat.experienceCount += 1;
      stat.successCount += item.success === true ? 1 : 0;
      stat.successRate = Math.max(Number(stat.successRate || 0), item.success === true ? 1 : 0);
      map.set(item.toolId, stat);
    }
    return Array.from(map.values()).sort((a, b) => Number(b.successRate || 0) - Number(a.successRate || 0));
  }

  buildSuggestions(tools = [], improvements = []) {
    const suggestions = [];
    for (const tool of tools) {
      const rate = Number(tool.successRate || 0);
      if (rate >= 0.9) {
        suggestions.push({
          capability: tool.capability || tool.toolId,
          toolId: tool.toolId,
          action: "grow",
          reason: "历史成功率高，建议作为优先能力继续强化。",
          confidence: rate
        });
      } else if (rate > 0 && rate < 0.5) {
        suggestions.push({
          capability: tool.capability || tool.toolId,
          toolId: tool.toolId,
          action: "review",
          reason: "历史成功率偏低，建议保留但降低推荐权重。",
          confidence: 1 - rate
        });
      }
    }
    for (const item of improvements.slice(0, 5)) {
      suggestions.push({
        capability: item.taskType || "general",
        toolId: "",
        action: "suggest",
        reason: item.improvement || item.reason || "来自反思系统的改进建议。",
        confidence: Number(item.confidence || 0.7)
      });
    }
    return suggestions;
  }

  filterByTask(items = [], taskType = "") {
    const target = normalize(taskType);
    if (!target) return items;
    return items.filter((item) => normalize(item.taskType).includes(target) || target.includes(normalize(item.taskType)));
  }

  append(item = {}) {
    const data = this.load();
    data.growth.push(item);
    this.writeJson(this.growthFile, { growth: data.growth.slice(-300) });
  }

  load() {
    return this.readJson(this.growthFile, { growth: [] });
  }

  ensureStore() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.growthFile)) this.writeJson(this.growthFile, { growth: [] });
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

module.exports = { CapabilityGrowthManager, DEFAULT_EVOLUTION_ROOT };
