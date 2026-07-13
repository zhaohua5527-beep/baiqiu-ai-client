const fs = require("node:fs");
const path = require("node:path");
const { dataRoot } = require("../data-root");

const DEFAULT_REFLECTION_ROOT = path.join(dataRoot(), "reflection");

function nowIso() {
  return new Date().toISOString();
}

class ReflectionMemory {
  constructor({ rootDir = DEFAULT_REFLECTION_ROOT, maxItems = 500 } = {}) {
    this.rootDir = rootDir;
    this.reflectionsFile = path.join(rootDir, "reflections.json");
    this.mistakesFile = path.join(rootDir, "mistakes.json");
    this.improvementsFile = path.join(rootDir, "improvements.json");
    this.maxItems = maxItems;
    this.ensureStore();
  }

  ensureStore() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.reflectionsFile)) this.writeJson(this.reflectionsFile, { reflections: [] });
    if (!fs.existsSync(this.mistakesFile)) this.writeJson(this.mistakesFile, { mistakes: [] });
    if (!fs.existsSync(this.improvementsFile)) this.writeJson(this.improvementsFile, { improvements: [] });
  }

  record(input = {}) {
    if (!this.canRecord(input)) return null;
    const item = {
      taskType: input.taskType || "",
      mistake: input.mistake || "",
      reason: input.reason || "",
      improvement: input.improvement || "",
      confidence: Number.isFinite(Number(input.confidence)) ? Number(input.confidence) : 0.8,
      status: input.status || "",
      timestamp: input.timestamp || nowIso()
    };
    this.append(this.reflectionsFile, "reflections", item);
    if (item.mistake) this.append(this.mistakesFile, "mistakes", item);
    if (item.improvement) this.append(this.improvementsFile, "improvements", item);
    return item;
  }

  canRecord(input = {}) {
    const errorType = String(input.errorType || "").toLowerCase();
    if (errorType === "fatal" || errorType === "permission" || errorType === "permission_denied") return false;
    return true;
  }

  getHints({ taskType = "" } = {}) {
    const improvements = this.loadImprovements().improvements
      .filter((item) => !taskType || item.taskType === taskType)
      .sort((a, b) => Number(b.confidence || 0) - Number(a.confidence || 0));
    const best = improvements[0] || null;
    return {
      available: Boolean(best),
      taskType,
      suggestion: best?.improvement || "",
      confidence: Number(best?.confidence || 0),
      improvements
    };
  }

  loadReflections() {
    return this.readJson(this.reflectionsFile, { reflections: [] });
  }

  loadMistakes() {
    return this.readJson(this.mistakesFile, { mistakes: [] });
  }

  loadImprovements() {
    return this.readJson(this.improvementsFile, { improvements: [] });
  }

  append(file, key, item) {
    const data = this.readJson(file, { [key]: [] });
    const list = Array.isArray(data[key]) ? data[key] : [];
    list.push(item);
    this.writeJson(file, { [key]: list.slice(-this.maxItems) });
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

module.exports = { ReflectionMemory, DEFAULT_REFLECTION_ROOT };
