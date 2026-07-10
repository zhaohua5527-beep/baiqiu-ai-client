const fs = require("node:fs");
const path = require("node:path");
const { ShortTermMemory, DEFAULT_MEMORY_ARCHITECTURE_ROOT } = require("./short-term-memory");
const { LongTermMemory } = require("./long-term-memory");
const { EpisodicMemory } = require("./episodic-memory");
const { SemanticMemory } = require("./semantic-memory");

function nowIso() {
  return new Date().toISOString();
}

function normalize(value = "") {
  return String(value || "").trim().toLowerCase();
}

function scoreMemory(item = {}, query = {}) {
  const keyword = normalize(query.keyword || query.input || "");
  const taskType = normalize(query.taskType || "");
  const haystack = [item.content, item.concept, item.result, item.taskType, item.type, ...(item.tags || [])].map(normalize).join(" ");
  let score = Number(item.confidence || 0.5);
  if (keyword && haystack.includes(keyword)) score += 0.35;
  if (taskType && normalize(item.taskType) === taskType) score += 0.25;
  if (item.scope === "short_term") score += 0.05;
  if (item.scope === "semantic") score += 0.08;
  if (item.success === true) score += 0.05;
  return Number(score.toFixed(4));
}

class MemoryRetriever {
  constructor({
    rootDir = DEFAULT_MEMORY_ARCHITECTURE_ROOT,
    shortTermMemory = null,
    longTermMemory = null,
    episodicMemory = null,
    semanticMemory = null
  } = {}) {
    this.rootDir = rootDir;
    this.filePath = path.join(rootDir, "memory-retrievals.json");
    this.shortTermMemory = shortTermMemory || new ShortTermMemory({ rootDir });
    this.longTermMemory = longTermMemory || new LongTermMemory({ rootDir });
    this.episodicMemory = episodicMemory || new EpisodicMemory({ rootDir });
    this.semanticMemory = semanticMemory || new SemanticMemory({ rootDir });
    this.ensureStore();
  }

  retrieve(query = {}) {
    const limit = Math.max(1, Number(query.limit) || 10);
    const keyword = query.keyword || query.input || "";
    const taskType = query.taskType || "";
    const candidates = [
      ...this.shortTermMemory.query({ keyword, taskType, limit: 50 }),
      ...this.longTermMemory.query({ keyword, taskType, limit: 50 }),
      ...this.episodicMemory.query({ keyword, taskType, limit: 50 }),
      ...this.semanticMemory.queryConcepts({ keyword, taskType, limit: 50 })
    ];
    const ranked = candidates
      .map((item) => ({ ...item, retrievalScore: scoreMemory(item, query) }))
      .sort((a, b) => b.retrievalScore - a.retrievalScore)
      .slice(0, limit);
    const record = {
      query: { keyword, taskType },
      resultCount: ranked.length,
      results: ranked.map((item) => ({ memoryId: item.memoryId, scope: item.scope, score: item.retrievalScore })),
      timestamp: nowIso(),
      safety: this.safety()
    };
    this.appendRetrieval(record);
    return {
      query: { keyword, taskType },
      memories: ranked,
      safety: this.safety()
    };
  }

  appendRetrieval(record = {}) {
    const data = this.load();
    data.retrievals.push(record);
    this.writeJson(this.filePath, { retrievals: data.retrievals.slice(-200) });
  }

  load() {
    return this.readJson(this.filePath, { retrievals: [] });
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
    if (!fs.existsSync(this.filePath)) this.writeJson(this.filePath, { retrievals: [] });
  }

  readJson(file, fallback) {
    this.ensureStore();
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
      return { retrievals: Array.isArray(parsed.retrievals) ? parsed.retrievals : [] };
    } catch {
      return fallback;
    }
  }

  writeJson(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  }
}

module.exports = { MemoryRetriever };
