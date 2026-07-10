const fs = require("node:fs");
const path = require("node:path");
const { MemoryCenter } = require("../memory-center");
const { DEFAULT_MEMORY_ARCHITECTURE_ROOT } = require("./short-term-memory");

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix = "ltm") {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function cleanText(value = "", limit = 2000) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

class LongTermMemory {
  constructor({ rootDir = DEFAULT_MEMORY_ARCHITECTURE_ROOT, memoryCenter = null, maxItems = 500 } = {}) {
    this.rootDir = rootDir;
    this.filePath = path.join(rootDir, "long-term-memory.json");
    this.memoryCenter = memoryCenter || new MemoryCenter();
    this.maxItems = maxItems;
    this.ensureStore();
  }

  rememberFact(input = {}) {
    const item = {
      memoryId: input.memoryId || makeId(),
      type: input.type || "fact",
      scope: "long_term",
      source: input.source || "memory_architecture",
      taskType: input.taskType || "",
      content: cleanText(input.content || input.fact || ""),
      tags: Array.isArray(input.tags) ? input.tags : [],
      confidence: Number.isFinite(Number(input.confidence)) ? Number(input.confidence) : 0.85,
      timestamp: input.timestamp || nowIso(),
      safety: this.safety()
    };
    if (!item.content) return null;
    const data = this.load();
    const duplicateKey = [item.type, item.source, item.taskType, item.content].join("|").toLowerCase();
    const items = data.items.filter((old) => [old.type, old.source, old.taskType, old.content].join("|").toLowerCase() !== duplicateKey);
    items.push(item);
    this.save({ items: items.slice(-this.maxItems) });
    return item;
  }

  importMemoryCenterSnapshot() {
    const snapshot = this.memoryCenter.snapshot?.() || {};
    const imported = [];
    const user = snapshot.user || {};
    if (user.name) imported.push(this.rememberFact({ type: "user", source: "MemoryCenter", content: `user.name=${user.name}`, tags: ["identity"] }));
    if (user.nickname) imported.push(this.rememberFact({ type: "user", source: "MemoryCenter", content: `user.nickname=${user.nickname}`, tags: ["identity"] }));
    for (const preference of user.preferences || []) {
      imported.push(this.rememberFact({ type: "preference", source: "MemoryCenter", content: preference, tags: ["preference"] }));
    }
    const project = snapshot.context?.project || {};
    for (const [key, value] of Object.entries(project)) {
      imported.push(this.rememberFact({ type: "project", source: "MemoryCenter", content: `${key}=${JSON.stringify(value)}`, tags: ["project"] }));
    }
    return imported.filter(Boolean);
  }

  listFacts({ type = "", limit = 100 } = {}) {
    const filterType = cleanText(type, 100).toLowerCase();
    return this.load().items
      .filter((item) => !filterType || String(item.type || "").toLowerCase() === filterType)
      .slice(-Math.max(0, Number(limit) || 100));
  }

  query({ keyword = "", taskType = "", limit = 20 } = {}) {
    const word = cleanText(keyword, 200).toLowerCase();
    const task = cleanText(taskType, 200).toLowerCase();
    return this.load().items
      .filter((item) => {
        const haystack = [item.content, item.type, item.taskType, ...(item.tags || [])].join(" ").toLowerCase();
        return (!word || haystack.includes(word)) && (!task || String(item.taskType || "").toLowerCase() === task);
      })
      .slice(-Math.max(0, Number(limit) || 20));
  }

  load() {
    return this.readJson(this.filePath, { items: [] });
  }

  save(data = {}) {
    this.writeJson(this.filePath, { items: Array.isArray(data.items) ? data.items : [] });
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
    if (!fs.existsSync(this.filePath)) this.writeJson(this.filePath, { items: [] });
  }

  readJson(file, fallback) {
    this.ensureStore();
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
      return { items: Array.isArray(parsed.items) ? parsed.items : [] };
    } catch {
      return fallback;
    }
  }

  writeJson(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  }
}

module.exports = { LongTermMemory };
