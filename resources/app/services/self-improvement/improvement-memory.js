const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_SELF_IMPROVEMENT_ROOT = path.join("D:\\BaiQiuAI", "data", "self-improvement");

function nowIso() {
  return new Date().toISOString();
}

class ImprovementMemory {
  constructor({ rootDir = DEFAULT_SELF_IMPROVEMENT_ROOT, maxItems = 300 } = {}) {
    this.rootDir = rootDir;
    this.improvementsFile = path.join(rootDir, "improvements.json");
    this.historyFile = path.join(rootDir, "improvement-history.json");
    this.maxItems = maxItems;
    this.ensureStore();
  }

  record(input = {}) {
    const item = {
      improvementId: input.improvementId || `improve-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      taskType: input.taskType || "",
      input: String(input.input || "").slice(0, 1000),
      analysis: input.analysis || null,
      plan: input.plan || null,
      evaluation: input.evaluation || null,
      improvementHints: input.improvementHints || null,
      timestamp: input.timestamp || nowIso(),
      safety: this.safety()
    };
    const improvements = this.loadImprovements().items;
    const history = this.loadHistory().items;
    improvements.push(item);
    history.push({
      improvementId: item.improvementId,
      taskType: item.taskType,
      hintCount: Array.isArray(item.improvementHints?.hints) ? item.improvementHints.hints.length : 0,
      score: Number(item.evaluation?.score || 0),
      timestamp: item.timestamp,
      safety: this.safety()
    });
    this.writeJson(this.improvementsFile, { items: improvements.slice(-this.maxItems) });
    this.writeJson(this.historyFile, { items: history.slice(-this.maxItems) });
    return item;
  }

  getHints({ taskType = "", limit = 5 } = {}) {
    const items = this.loadImprovements().items
      .filter((item) => !taskType || item.taskType === taskType)
      .slice(-Math.max(1, Number(limit) || 5));
    const hints = items.flatMap((item) => item.improvementHints?.hints || []);
    return {
      available: hints.length > 0,
      taskType,
      hints: hints.slice(-Math.max(1, Number(limit) || 5)),
      safety: this.safety()
    };
  }

  loadImprovements() {
    return this.readJson(this.improvementsFile, { items: [] });
  }

  loadHistory() {
    return this.readJson(this.historyFile, { items: [] });
  }

  safety() {
    return {
      selfImprovementOnly: true,
      advisoryOnly: true,
      modifiesPermission: false,
      executesTool: false,
      bypassesToolSelector: false,
      bypassesVerifierCenter: false
    };
  }

  ensureStore() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.improvementsFile)) this.writeJson(this.improvementsFile, { items: [] });
    if (!fs.existsSync(this.historyFile)) this.writeJson(this.historyFile, { items: [] });
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

module.exports = { ImprovementMemory, DEFAULT_SELF_IMPROVEMENT_ROOT };
