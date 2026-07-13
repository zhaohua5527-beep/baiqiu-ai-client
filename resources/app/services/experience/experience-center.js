const fs = require("node:fs");
const path = require("node:path");
const { dataRoot } = require("../data-root");
const { KnowledgeCenter } = require("../knowledge/knowledge-center");
const { KnowledgeIndexer } = require("../knowledge/knowledge-indexer");

const DEFAULT_EXPERIENCE_DIR = path.join(dataRoot(), "experience");
const DEFAULT_EXPERIENCE_FILE = path.join(DEFAULT_EXPERIENCE_DIR, "experiences.json");

function nowIso() {
  return new Date().toISOString();
}

function normalize(value = "") {
  return String(value || "").trim().toLowerCase();
}

function safeId() {
  return `exp-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

class ExperienceCenter {
  constructor({ rootDir = DEFAULT_EXPERIENCE_DIR, filePath = null, maxItems = 200, knowledgeCenter = null } = {}) {
    this.rootDir = rootDir;
    this.filePath = filePath || path.join(rootDir, "experiences.json");
    this.maxItems = maxItems;
    this.knowledgeCenter = knowledgeCenter || new KnowledgeCenter();
    this.knowledgeIndexer = new KnowledgeIndexer({ knowledgeCenter: this.knowledgeCenter });
    this.ensureStore();
  }

  ensureStore() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.filePath)) this.save({ experiences: [] });
  }

  load() {
    this.ensureStore();
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      return { experiences: Array.isArray(parsed.experiences) ? parsed.experiences : [] };
    } catch {
      return { experiences: [] };
    }
  }

  save(data = {}) {
    const experiences = Array.isArray(data.experiences) ? data.experiences.slice(-this.maxItems) : [];
    fs.writeFileSync(this.filePath, JSON.stringify({ experiences }, null, 2), "utf8");
  }

  record(input = {}) {
    if (input.success !== true) return null;
    if (!input.solution || input.solution === "abort" || input.errorType === "fatal") return null;
    const item = {
      experienceId: input.experienceId || safeId(),
      taskType: input.taskType || "",
      toolId: input.toolId || "",
      errorType: input.errorType || "",
      failedReason: String(input.failedReason || "").slice(0, 500),
      solution: input.solution || "",
      success: true,
      timestamp: input.timestamp || nowIso()
    };
    const data = this.load();
    const duplicateKey = [item.taskType, item.toolId, item.errorType, item.solution].map(normalize).join("|");
    const filtered = data.experiences.filter((old) => [old.taskType, old.toolId, old.errorType, old.solution].map(normalize).join("|") !== duplicateKey);
    filtered.push(item);
    this.save({ experiences: filtered });
    this.syncKnowledge(item);
    return item;
  }

  syncKnowledge(item) {
    if (!item || item.success !== true) return null;
    const knowledge = this.knowledgeCenter.addKnowledge({
      type: "experience",
      source: item.failedReason || item.errorType || "",
      taskType: item.taskType || "",
      toolId: item.toolId || "",
      experience: item.errorType && item.solution ? `${item.errorType} -> ${item.solution}` : item.solution,
      result: item.solution,
      successRate: 1,
      successCount: 1,
      failCount: 0,
      timestamp: item.timestamp
    });
    this.knowledgeIndexer.buildIndex();
    return knowledge;
  }

  recommend({ taskType = "", toolId = "", errorType = "", errorPattern = "" } = {}) {
    const data = this.load();
    const normalizedTask = normalize(taskType);
    const normalizedTool = normalize(toolId);
    const normalizedError = normalize(errorType);
    const normalizedPattern = normalize(errorPattern);
    const matches = data.experiences
      .filter((item) => item.success === true)
      .filter((item) => !normalizedTask || normalize(item.taskType) === normalizedTask)
      .filter((item) => !normalizedTool || normalize(item.toolId) === normalizedTool)
      .filter((item) => {
        if (normalizedError) return normalize(item.errorType) === normalizedError;
        if (!normalizedPattern) return true;
        return normalize(item.failedReason).includes(normalizedPattern) || normalizedPattern.includes(normalize(item.errorType));
      })
      .sort((a, b) => String(b.timestamp || "").localeCompare(String(a.timestamp || "")));
    const best = matches[0] || null;
    if (!best) return { found: false, recommendedAction: "", experience: null };
    return { found: true, recommendedAction: best.solution, experience: best };
  }

  list() {
    return this.load().experiences;
  }

  clear() {
    this.save({ experiences: [] });
  }
}

module.exports = { ExperienceCenter, DEFAULT_EXPERIENCE_DIR, DEFAULT_EXPERIENCE_FILE };
