const fs = require("node:fs");
const path = require("node:path");
const { dataRoot } = require("../data-root");

const DEFAULT_REASONING_ROOT = path.join(dataRoot(), "reasoning");

function makeId() {
  return `rs-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

class ReasoningMemory {
  constructor({ rootDir = DEFAULT_REASONING_ROOT, maxRecords = 300 } = {}) {
    this.rootDir = rootDir;
    this.filePath = path.join(rootDir, "reasoning.json");
    this.maxRecords = maxRecords;
    this.ensureStore();
  }

  ensureStore() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.filePath)) this.save({ decisions: [] });
  }

  load() {
    this.ensureStore();
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      return { decisions: Array.isArray(parsed.decisions) ? parsed.decisions : [] };
    } catch {
      return { decisions: [] };
    }
  }

  save(data = {}) {
    fs.mkdirSync(this.rootDir, { recursive: true });
    const decisions = Array.isArray(data.decisions) ? data.decisions.slice(-this.maxRecords) : [];
    fs.writeFileSync(this.filePath, JSON.stringify({ decisions }, null, 2), "utf8");
  }

  recordDecision(input = {}) {
    if (input.success !== true) return null;
    const data = this.load();
    const item = {
      id: input.id || makeId(),
      taskType: input.taskType || "",
      selectedPlan: input.selectedPlan || null,
      reason: input.reason || "",
      success: true,
      timestamp: input.timestamp || new Date().toISOString()
    };
    data.decisions.push(item);
    this.save(data);
    return item;
  }

  query({ taskType = "" } = {}) {
    const target = String(taskType || "").toLowerCase();
    return this.list().filter((item) => !target || String(item.taskType || "").toLowerCase() === target);
  }

  list() {
    return this.load().decisions;
  }

  clear() {
    this.save({ decisions: [] });
  }
}

module.exports = { ReasoningMemory, DEFAULT_REASONING_ROOT };
