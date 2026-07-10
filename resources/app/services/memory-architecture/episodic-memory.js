const fs = require("node:fs");
const path = require("node:path");
const { DEFAULT_MEMORY_ARCHITECTURE_ROOT } = require("./short-term-memory");

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix = "epi") {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function cleanText(value = "", limit = 2000) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

class EpisodicMemory {
  constructor({ rootDir = DEFAULT_MEMORY_ARCHITECTURE_ROOT, maxItems = 500 } = {}) {
    this.rootDir = rootDir;
    this.filePath = path.join(rootDir, "episodic-memory.json");
    this.maxItems = maxItems;
    this.ensureStore();
  }

  recordEpisode(input = {}) {
    const item = {
      memoryId: input.memoryId || makeId(),
      type: input.type || "episode",
      scope: "episodic",
      source: input.source || "task",
      taskType: input.taskType || "",
      content: cleanText(input.content || input.summary || ""),
      result: input.result || "",
      success: input.success === true,
      tags: Array.isArray(input.tags) ? input.tags : [],
      confidence: Number.isFinite(Number(input.confidence)) ? Number(input.confidence) : 0.8,
      timestamp: input.timestamp || nowIso(),
      safety: this.safety()
    };
    if (!item.content && !item.taskType) return null;
    const data = this.load();
    data.items.push(item);
    this.save({ items: data.items.slice(-this.maxItems) });
    return item;
  }

  listEpisodes({ taskType = "", success = null, limit = 100 } = {}) {
    const task = cleanText(taskType, 200).toLowerCase();
    return this.load().items
      .filter((item) => !task || String(item.taskType || "").toLowerCase() === task)
      .filter((item) => success === null || item.success === success)
      .slice(-Math.max(0, Number(limit) || 100));
  }

  query({ keyword = "", taskType = "", limit = 20 } = {}) {
    const word = cleanText(keyword, 200).toLowerCase();
    const task = cleanText(taskType, 200).toLowerCase();
    return this.load().items
      .filter((item) => {
        const haystack = [item.content, item.result, item.taskType, ...(item.tags || [])].join(" ").toLowerCase();
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

module.exports = { EpisodicMemory };
