const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_EXPERIENCE_MEMORY_FILE = path.join("D:\\BaiQiuAI", "data", "memory", "experience.json");

function nowIso() {
  return new Date().toISOString();
}

function normalize(value = "") {
  return String(value || "").trim().toLowerCase();
}

function metric(name, data) {
  try { require("./agent-event-bus").recordRuntimeMetric?.(name, data); } catch {}
}

function keywordsFrom(input = {}) {
  const raw = [
    input.taskType,
    input.intent,
    input.problem,
    input.cause,
    input.solution,
    input.strategy?.mode,
    input.strategy?.strategyId,
    input.decision?.decision,
    ...(Array.isArray(input.toolsUsed) ? input.toolsUsed : []),
    ...(Array.isArray(input.toolSequence) ? input.toolSequence : []),
    ...(Array.isArray(input.keywords) ? input.keywords : [])
  ].filter(Boolean).join(" ");
  const words = raw
    .split(/[^A-Za-z0-9_\-\u4e00-\u9fa5]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2);
  const aliases = [];
  if (/calculator|计算器|計算器/i.test(raw)) aliases.push("calculator", "计算器", "dev.code.calculator");
  if (/html|网页|应用|软件/i.test(raw)) aliases.push("html", "应用", "软件");
  if (/file|文件/i.test(raw)) aliases.push("file", "文件");
  return [...new Set([...words, ...aliases])].slice(0, 30);
}

class ExperienceStore {
  constructor({ filePath = DEFAULT_EXPERIENCE_MEMORY_FILE, memoryCenter = null, maxItems = 500 } = {}) {
    this.filePath = filePath;
    this.memoryCenter = memoryCenter;
    this.maxItems = maxItems;
    this.ensureStore();
  }

  saveExperience(input = {}) {
    const startedAt = Date.now();
    const item = {
      taskType: input.taskType || "",
      problem: String(input.problem || "").slice(0, 500),
      cause: String(input.cause || "").slice(0, 500),
      solution: String(input.solution || "").slice(0, 500),
      intent: input.intent || input.taskType || "",
      toolSequence: Array.isArray(input.toolSequence) ? input.toolSequence.filter(Boolean) : (Array.isArray(input.toolsUsed) ? input.toolsUsed.filter(Boolean) : []),
      strategy: input.strategy || null,
      decision: input.decision || null,
      keywords: keywordsFrom(input),
      toolsUsed: Array.isArray(input.toolsUsed) ? input.toolsUsed.filter(Boolean) : [],
      relevance: Number.isFinite(Number(input.relevance)) ? Math.max(0, Math.min(1, Number(input.relevance))) : 0,
      usageCount: Math.max(0, Number(input.usageCount || 0)),
      successRate: Number.isFinite(Number(input.successRate)) ? Number(input.successRate) : (input.success === false ? 0 : 1),
      lastUsed: input.lastUsed || null,
      confidence: Number.isFinite(Number(input.confidence)) ? Math.max(0, Math.min(1, Number(input.confidence))) : 0.7,
      createdAt: input.createdAt || nowIso()
    };
    if (this.memoryCenter?.recordExperience) {
      const saved = this.memoryCenter.recordExperience(item);
      metric("ExperienceStore.write", { duration: Date.now() - startedAt, success: true });
      return saved;
    }
    const data = this.load();
    data.items.push(item);
    this.write({ items: this.dedupe(data.items).slice(-this.maxItems) });
    metric("ExperienceStore.write", { duration: Date.now() - startedAt, success: true });
    return item;
  }

  query({ taskType = "", intent = "", toolId = "", tools = [], strategy = "", keywords = [], problem = "", limit = 10 } = {}) {
    const startedAt = Date.now();
    const task = normalize(taskType);
    const intentValue = normalize(intent);
    const tool = normalize(toolId);
    const toolSet = new Set([tool, ...tools.map(normalize)].filter(Boolean));
    const keywordSet = new Set(keywords.map(normalize).filter(Boolean));
    const text = normalize(problem);
    const matches = this.load().items
      .map((item) => ({ ...item, relevance: this.relevance(item, { taskType, intent: intentValue, toolSet, strategy, keywordSet, problem }) }))
      .filter((item) => !task || (normalize(item.taskType) && (normalize(item.taskType).includes(task) || task.includes(normalize(item.taskType)))) || item.relevance >= 0.5)
      .filter((item) => item.relevance > 0 || (!task && !intentValue && !toolSet.size && !keywordSet.size && !text))
      .sort((a, b) => ((Number(b.relevance || 0) * 3) + Number(b.confidence || 0) + Number(b.successRate || 0)) - ((Number(a.relevance || 0) * 3) + Number(a.confidence || 0) + Number(a.successRate || 0)))
      .slice(0, Math.max(1, Number(limit) || 10));
    this.markUsed(matches);
    metric("ExperienceStore.query", { duration: Date.now() - startedAt, success: true, hit: matches.length > 0 });
    return matches;
  }

  relevance(item = {}, { taskType = "", intent = "", toolSet = new Set(), strategy = "", keywordSet = new Set(), problem = "" } = {}) {
    const task = normalize(taskType);
    const intentValue = normalize(intent);
    const text = normalize(problem);
    const itemTask = normalize(item.taskType);
    const itemIntent = normalize(item.intent);
    const itemTools = [...(item.toolsUsed || []), ...(item.toolSequence || [])].map(normalize);
    const itemKeywords = (item.keywords || []).map(normalize);
    const haystack = normalize(`${item.problem} ${item.cause} ${item.solution} ${itemTools.join(" ")} ${itemKeywords.join(" ")} ${item.strategy?.strategyId || ""} ${item.strategy?.mode || ""} ${item.decision?.decision || ""}`);
    let score = 0;
    if (task && itemTask && (itemTask.includes(task) || task.includes(itemTask))) score += 0.45;
    if (intentValue && itemIntent && (itemIntent.includes(intentValue) || intentValue.includes(itemIntent))) score += 0.2;
    for (const tool of toolSet) if (itemTools.includes(tool)) score += 0.15;
    const strategyValue = normalize(strategy);
    if (strategyValue && haystack.includes(strategyValue)) score += 0.1;
    for (const keyword of keywordSet) if (itemKeywords.includes(keyword) || haystack.includes(keyword)) score += 0.05;
    if (text && haystack) {
      const queryWords = keywordsFrom({ problem }).map(normalize);
      if (queryWords.some((part) => part && haystack.includes(part))) score += 0.2;
    }
    if (Number(item.successRate || 0) >= 0.8) score += 0.1;
    if (Number(item.confidence || 0) >= 0.8) score += 0.05;
    return Math.max(0, Math.min(1, Number(score.toFixed(2))));
  }

  markUsed(matches = []) {
    if (!matches.length || this.memoryCenter?.recordExperience) return;
    const data = this.load();
    const keys = new Set(matches.map((item) => this.keyFor(item)));
    const now = nowIso();
    data.items = data.items.map((item) => {
      if (!keys.has(this.keyFor(item))) return item;
      return { ...item, usageCount: Number(item.usageCount || 0) + 1, lastUsed: now };
    });
    this.write(data);
  }

  load() {
    this.ensureStore();
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      return { items: Array.isArray(parsed.items) ? parsed.items : [] };
    } catch (error) {
      this.repairStore(error);
      return { items: [] };
    }
  }

  dedupe(items = []) {
    const map = new Map();
    for (const item of items) {
      map.set(this.keyFor(item), item);
    }
    return Array.from(map.values());
  }

  keyFor(item = {}) {
    return [item.taskType, item.intent, item.problem, item.cause, item.solution, (item.toolsUsed || []).join(","), (item.keywords || []).join(",")].map(normalize).join("|");
  }

  ensureStore() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    if (!fs.existsSync(this.filePath)) this.write({ items: [] });
  }

  write(data = {}) {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), "utf8");
  }

  repairStore(error = null) {
    try {
      if (fs.existsSync(this.filePath)) {
        fs.copyFileSync(this.filePath, `${this.filePath}.corrupt-${Date.now()}`);
      }
      this.write({ items: [] });
      metric("ExperienceStore.repair", { duration: 0, success: true });
      try {
        require("./agent-event-bus").writeDiagnostics?.({
          error: require("./agent-event-bus").normalizeError?.(error, "NC6001", "experience_store")
        });
      } catch {}
    } catch {
      metric("ExperienceStore.repair", { duration: 0, success: false });
    }
  }
}

module.exports = { ExperienceStore, DEFAULT_EXPERIENCE_MEMORY_FILE };
