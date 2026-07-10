const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_MEMORY_ARCHITECTURE_ROOT = path.join("D:\\BaiQiuAI", "data", "memory-architecture");

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix = "stm") {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function cleanText(value = "", limit = 2000) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

class ShortTermMemory {
  constructor({ rootDir = DEFAULT_MEMORY_ARCHITECTURE_ROOT, maxItems = 80 } = {}) {
    this.rootDir = rootDir;
    this.filePath = path.join(rootDir, "short-term-memory.json");
    this.maxItems = maxItems;
    this.ensureStore();
  }

  remember(input = {}) {
    const item = {
      memoryId: input.memoryId || makeId(),
      type: input.type || "context",
      scope: "short_term",
      source: input.source || "runtime",
      taskType: input.taskType || "",
      content: cleanText(input.content || input.text || ""),
      tags: Array.isArray(input.tags) ? input.tags : [],
      confidence: Number.isFinite(Number(input.confidence)) ? Number(input.confidence) : 0.8,
      timestamp: input.timestamp || nowIso(),
      safety: this.safety()
    };
    if (!item.content && !item.taskType && item.tags.length === 0) return null;
    const data = this.load();
    data.items.push(item);
    this.save({ items: data.items.slice(-this.maxItems) });
    return item;
  }

  recent(limit = 20) {
    return this.load().items.slice(-Math.max(0, Number(limit) || 20));
  }

  query({ keyword = "", taskType = "", limit = 20 } = {}) {
    const word = cleanText(keyword, 200).toLowerCase();
    const task = cleanText(taskType, 200).toLowerCase();
    return this.load().items
      .filter((item) => {
        const haystack = [item.content, item.taskType, ...(item.tags || [])].join(" ").toLowerCase();
        return (!word || haystack.includes(word)) && (!task || String(item.taskType || "").toLowerCase() === task);
      })
      .slice(-Math.max(0, Number(limit) || 20));
  }

  clear() {
    this.save({ items: [] });
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

module.exports = { ShortTermMemory, DEFAULT_MEMORY_ARCHITECTURE_ROOT };
