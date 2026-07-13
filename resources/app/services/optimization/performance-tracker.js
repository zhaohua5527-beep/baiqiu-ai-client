const fs = require("node:fs");
const path = require("node:path");
const { dataRoot } = require("../data-root");

const DEFAULT_OPTIMIZATION_DIR = path.join(dataRoot(), "optimization");
const DEFAULT_PERFORMANCE_FILE = path.join(DEFAULT_OPTIMIZATION_DIR, "performance.json");

function nowIso() {
  return new Date().toISOString();
}

function keyFor(toolId = "", taskType = "") {
  return `${String(taskType || "unknown").toLowerCase()}::${String(toolId || "unknown").toLowerCase()}`;
}

class PerformanceTracker {
  constructor({ rootDir = DEFAULT_OPTIMIZATION_DIR, filePath = null, maxRecords = 500 } = {}) {
    this.rootDir = rootDir;
    this.filePath = filePath || path.join(rootDir, "performance.json");
    this.maxRecords = maxRecords;
    this.ensureStore();
  }

  ensureStore() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.filePath)) this.save({ tools: {}, records: [] });
  }

  load() {
    this.ensureStore();
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      return {
        tools: parsed.tools && typeof parsed.tools === "object" ? parsed.tools : {},
        records: Array.isArray(parsed.records) ? parsed.records : []
      };
    } catch {
      return { tools: {}, records: [] };
    }
  }

  save(data = {}) {
    const records = Array.isArray(data.records) ? data.records.slice(-this.maxRecords) : [];
    const tools = data.tools && typeof data.tools === "object" ? data.tools : {};
    fs.writeFileSync(this.filePath, JSON.stringify({ tools, records }, null, 2), "utf8");
  }

  record({ toolId = "", taskType = "", success = false, duration = 0 } = {}) {
    if (!toolId) return null;
    const data = this.load();
    const key = keyFor(toolId, taskType);
    const previous = data.tools[key] || {
      toolId,
      taskType,
      successCount: 0,
      failCount: 0,
      avgDuration: 0,
      lastUsed: "",
      successRate: 0,
      sampleCount: 0
    };
    const nextSampleCount = Number(previous.sampleCount || 0) + 1;
    const safeDuration = Math.max(0, Number(duration || 0));
    const avgDuration = nextSampleCount === 1
      ? safeDuration
      : ((Number(previous.avgDuration || 0) * Number(previous.sampleCount || 0)) + safeDuration) / nextSampleCount;
    const successCount = Number(previous.successCount || 0) + (success ? 1 : 0);
    const failCount = Number(previous.failCount || 0) + (success ? 0 : 1);
    const item = {
      toolId,
      taskType,
      successCount,
      failCount,
      avgDuration,
      lastUsed: nowIso(),
      successRate: nextSampleCount ? successCount / nextSampleCount : 0,
      sampleCount: nextSampleCount
    };
    data.tools[key] = item;
    data.records.push({ toolId, taskType, success: Boolean(success), duration: safeDuration, timestamp: item.lastUsed });
    this.save(data);
    return item;
  }

  get(toolId = "", taskType = "") {
    return this.load().tools[keyFor(toolId, taskType)] || null;
  }

  list() {
    return Object.values(this.load().tools);
  }

  clear() {
    this.save({ tools: {}, records: [] });
  }
}

module.exports = { PerformanceTracker, DEFAULT_OPTIMIZATION_DIR, DEFAULT_PERFORMANCE_FILE };
