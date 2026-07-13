const fs = require("node:fs");
const path = require("node:path");
const { dataRoot } = require("../data-root");

const DEFAULT_ATTENTION_ROOT = path.join(dataRoot(), "attention");

function nowIso() {
  return new Date().toISOString();
}

function normalize(value = "") {
  return String(value || "").trim().toLowerCase();
}

class AttentionPriorityEngine {
  constructor({ rootDir = DEFAULT_ATTENTION_ROOT } = {}) {
    this.rootDir = rootDir;
    this.filePath = path.join(rootDir, "attention-priority.json");
    this.ensureStore();
  }

  score(signal = {}, query = {}) {
    const keyword = normalize(query.input || query.keyword || "");
    const taskType = normalize(query.taskType || "");
    const haystack = normalize([
      signal.content,
      signal.reason,
      signal.source,
      signal.taskType,
      signal.type,
      ...(signal.tags || [])
    ].join(" "));
    let score = Number(signal.confidence || 0.5);
    const sourceBoost = {
      goal: 0.22,
      workflow: 0.2,
      context: 0.18,
      reflection: 0.15,
      memory: 0.12,
      evolution: 0.1
    };
    score += sourceBoost[signal.sourceType] || 0;
    if (signal.urgent === true) score += 0.25;
    if (signal.blocked === true) score += 0.2;
    if (signal.critical === true) score += 0.18;
    if (keyword && haystack.includes(keyword)) score += 0.22;
    if (taskType && normalize(signal.taskType) === taskType) score += 0.18;
    return Number(Math.min(score, 1.6).toFixed(4));
  }

  rank(signals = [], query = {}) {
    const ranked = signals
      .map((signal) => ({ ...signal, attentionScore: this.score(signal, query) }))
      .sort((a, b) => b.attentionScore - a.attentionScore);
    this.writeJson(this.filePath, {
      lastRank: ranked.slice(0, 50).map((item) => ({
        attentionId: item.attentionId || "",
        sourceType: item.sourceType || "",
        attentionScore: item.attentionScore
      })),
      updatedAt: nowIso(),
      safety: this.safety()
    });
    return ranked;
  }

  safety() {
    return {
      attentionOnly: true,
      executesTool: false,
      bypassesToolSelector: false,
      bypassesVerifierCenter: false
    };
  }

  ensureStore() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.filePath)) this.writeJson(this.filePath, { lastRank: [], updatedAt: null, safety: this.safety() });
  }

  writeJson(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  }
}

module.exports = { AttentionPriorityEngine, DEFAULT_ATTENTION_ROOT };
