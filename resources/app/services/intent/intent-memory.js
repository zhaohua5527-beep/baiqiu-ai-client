const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_INTENT_ROOT = path.join("D:\\BaiQiuAI", "data", "intent");

function nowIso() {
  return new Date().toISOString();
}

class IntentMemory {
  constructor({ rootDir = DEFAULT_INTENT_ROOT, maxItems = 500 } = {}) {
    this.rootDir = rootDir;
    this.memoryFile = path.join(rootDir, "intent-memory.json");
    this.patternsFile = path.join(rootDir, "intent-patterns.json");
    this.maxItems = maxItems;
    this.ensureStore();
  }

  record(input = {}) {
    const item = {
      intentId: input.intentId || `intent-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      agentId: input.agentId || "default-agent",
      input: String(input.input || "").slice(0, 1000),
      intent: input.intent || "unknown",
      goal: input.goal || "",
      taskType: input.taskType || "",
      confidence: Number.isFinite(Number(input.confidence)) ? Number(input.confidence) : 0,
      contextSignals: Array.isArray(input.contextSignals) ? input.contextSignals : [],
      timestamp: input.timestamp || nowIso()
    };
    const data = this.load();
    data.items.push(item);
    this.writeJson(this.memoryFile, { items: data.items.slice(-this.maxItems) });
    this.updatePattern(item);
    return item;
  }

  recall({ input = "", intent = "", taskType = "" } = {}) {
    const normalized = normalize(input);
    const data = this.load().items;
    return data
      .filter((item) => !intent || item.intent === intent)
      .filter((item) => !taskType || item.taskType === taskType)
      .map((item) => ({ ...item, similarity: this.similarity(normalized, normalize(item.input)) }))
      .filter((item) => item.similarity > 0 || !normalized)
      .sort((a, b) => Number(b.similarity || 0) - Number(a.similarity || 0))
      .slice(0, 10);
  }

  getPatterns() {
    return this.readJson(this.patternsFile, { patterns: {} }).patterns || {};
  }

  updatePattern(item = {}) {
    const data = this.readJson(this.patternsFile, { patterns: {} });
    const key = item.intent || "unknown";
    const current = data.patterns[key] || { intent: key, count: 0, examples: [] };
    current.count += 1;
    current.examples = [item.input, ...current.examples.filter((old) => old !== item.input)].slice(0, 5);
    current.lastSeen = item.timestamp || nowIso();
    data.patterns[key] = current;
    this.writeJson(this.patternsFile, data);
  }

  similarity(a = "", b = "") {
    if (!a || !b) return 0;
    if (a === b) return 1;
    if (a.includes(b) || b.includes(a)) return 0.8;
    const aChars = new Set(a.split(""));
    const bChars = new Set(b.split(""));
    const overlap = Array.from(aChars).filter((char) => bChars.has(char)).length;
    const union = new Set([...aChars, ...bChars]).size || 1;
    return overlap / union;
  }

  load() {
    return this.readJson(this.memoryFile, { items: [] });
  }

  ensureStore() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.memoryFile)) this.writeJson(this.memoryFile, { items: [] });
    if (!fs.existsSync(this.patternsFile)) this.writeJson(this.patternsFile, { patterns: {} });
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

function normalize(value = "") {
  return String(value || "").trim().toLowerCase();
}

module.exports = { IntentMemory, DEFAULT_INTENT_ROOT };
