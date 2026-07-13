const fs = require("node:fs");
const path = require("node:path");
const { dataRoot } = require("../data-root");

const DEFAULT_KNOWLEDGE_ROOT = path.join(dataRoot(), "knowledge");

function makeId() {
  return `kn-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function normalize(value = "") {
  return String(value || "").trim().toLowerCase();
}

class KnowledgeCenter {
  constructor({ rootDir = DEFAULT_KNOWLEDGE_ROOT } = {}) {
    this.rootDir = rootDir;
    this.knowledgeFile = path.join(rootDir, "knowledge.json");
    this.indexFile = path.join(rootDir, "index.json");
    this.relationsFile = path.join(rootDir, "relations.json");
    this.ensureStore();
  }

  ensureStore() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.knowledgeFile)) this.writeJson(this.knowledgeFile, { items: [] });
    if (!fs.existsSync(this.indexFile)) this.writeJson(this.indexFile, { tasks: {}, tools: {}, failures: {} });
    if (!fs.existsSync(this.relationsFile)) this.writeJson(this.relationsFile, { relations: [] });
  }

  addKnowledge(input = {}) {
    const item = {
      id: input.id || makeId(),
      type: input.type || "task",
      source: input.source || "",
      taskType: input.taskType || "",
      toolId: input.toolId || "",
      capability: input.capability || "",
      skill: input.skill || "",
      experience: input.experience || "",
      result: input.result || "",
      successRate: Number.isFinite(Number(input.successRate)) ? Number(input.successRate) : 0,
      timestamp: input.timestamp || new Date().toISOString(),
      usageCount: Number(input.usageCount || 0),
      successCount: Number(input.successCount || 0),
      failCount: Number(input.failCount || 0)
    };
    const data = this.loadKnowledge();
    const index = data.items.findIndex((old) => old.id === item.id);
    if (index >= 0) data.items[index] = { ...data.items[index], ...item };
    else data.items.push(item);
    this.writeJson(this.knowledgeFile, data);
    return item;
  }

  updateKnowledge(id = "", patch = {}) {
    const data = this.loadKnowledge();
    const index = data.items.findIndex((item) => item.id === id);
    if (index === -1) return null;
    data.items[index] = { ...data.items[index], ...patch, id };
    this.writeJson(this.knowledgeFile, data);
    return data.items[index];
  }

  queryKnowledge(query = {}) {
    const task = normalize(query.task || query.taskType || "");
    const tool = normalize(query.toolId || "");
    const type = normalize(query.type || "");
    return this.loadKnowledge().items.filter((item) => {
      if (type && normalize(item.type) !== type) return false;
      if (tool && normalize(item.toolId) !== tool) return false;
      if (task) {
        const haystack = [item.taskType, item.source, item.capability, item.skill].map(normalize).join(" ");
        if (!haystack.includes(task) && !task.includes(normalize(item.taskType))) return false;
      }
      return true;
    });
  }

  getRelatedKnowledge(key = "") {
    const value = normalize(key);
    if (!value) return [];
    const relations = this.readJson(this.relationsFile, { relations: [] }).relations || [];
    return relations.filter((item) => normalize(item.from) === value || normalize(item.to) === value);
  }

  queryHistoricalPlans({ taskType = "" } = {}) {
    const items = this.queryKnowledge({ taskType })
      .filter((item) => item.toolId)
      .sort((a, b) => Number(b.successRate || 0) - Number(a.successRate || 0));
    const grouped = new Map();
    for (const item of items) {
      const key = item.taskType || taskType || "unknown";
      const existing = grouped.get(key) || {
        taskType: key,
        tools: [],
        successRate: 0,
        source: item.source || ""
      };
      if (!existing.tools.includes(item.toolId)) existing.tools.push(item.toolId);
      existing.successRate = Math.max(Number(existing.successRate || 0), Number(item.successRate || 0));
      grouped.set(key, existing);
    }
    return Array.from(grouped.values());
  }

  loadKnowledge() {
    const data = this.readJson(this.knowledgeFile, { items: [] });
    return { items: Array.isArray(data.items) ? data.items : [] };
  }

  saveIndex(index = {}) {
    this.writeJson(this.indexFile, index);
  }

  loadIndex() {
    return this.readJson(this.indexFile, { tasks: {}, tools: {}, failures: {} });
  }

  saveRelations(relations = []) {
    this.writeJson(this.relationsFile, { relations });
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

module.exports = { KnowledgeCenter, DEFAULT_KNOWLEDGE_ROOT };
