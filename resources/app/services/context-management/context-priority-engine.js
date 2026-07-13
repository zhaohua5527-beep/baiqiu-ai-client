const fs = require("node:fs");
const path = require("node:path");
const { dataRoot } = require("../data-root");

const DEFAULT_CONTEXT_MANAGEMENT_ROOT = path.join(dataRoot(), "context-management");

function nowIso() {
  return new Date().toISOString();
}

function normalize(value = "") {
  return String(value || "").trim().toLowerCase();
}

class ContextPriorityEngine {
  constructor({ rootDir = DEFAULT_CONTEXT_MANAGEMENT_ROOT } = {}) {
    this.rootDir = rootDir;
    this.filePath = path.join(rootDir, "context-priority.json");
    this.ensureStore();
  }

  scoreItem(item = {}, query = {}) {
    const keyword = normalize(query.input || query.keyword || "");
    const taskType = normalize(query.taskType || "");
    const text = normalize([item.content, item.summary, item.source, item.taskType, item.type, ...(item.tags || [])].join(" "));
    let score = Number(item.confidence || 0.5);
    const scopeBoost = {
      active: 0.24,
      short_term: 0.18,
      goal: 0.16,
      workflow: 0.14,
      semantic: 0.12,
      reflection: 0.1,
      knowledge: 0.1,
      skill: 0.08,
      long_term: 0.08,
      compressed: 0.04
    };
    score += scopeBoost[item.scope] || scopeBoost[item.type] || 0;
    if (keyword && text.includes(keyword)) score += 0.28;
    if (taskType && normalize(item.taskType) === taskType) score += 0.2;
    if (item.success === true) score += 0.04;
    if (item.critical === true) score += 0.2;
    return Number(Math.min(score, 1.5).toFixed(4));
  }

  rank(items = [], query = {}) {
    const ranked = items
      .map((item) => ({ ...item, priorityScore: this.scoreItem(item, query) }))
      .sort((a, b) => b.priorityScore - a.priorityScore);
    this.writeJson(this.filePath, {
      lastRank: ranked.slice(0, 50).map((item) => ({
        id: item.id || item.memoryId || item.contextId || "",
        scope: item.scope || item.type || "",
        priorityScore: item.priorityScore
      })),
      updatedAt: nowIso(),
      safety: this.safety()
    });
    return ranked;
  }

  safety() {
    return {
      contextOnly: true,
      executesTool: false,
      bypassesToolSelector: false,
      bypassesVerifierCenter: false
    };
  }

  ensureStore() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.filePath)) this.writeJson(this.filePath, { lastRank: [], updatedAt: null, safety: this.safety() });
  }

  writeJson(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  }
}

module.exports = { ContextPriorityEngine, DEFAULT_CONTEXT_MANAGEMENT_ROOT };
