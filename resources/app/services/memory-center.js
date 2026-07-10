const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { getDefaultAgentStateManager } = require("./agent_state_manager");
const { getDefaultAgentEventBus, AGENT_EVENTS } = require("./neural-core/agent-event-bus");

const DEFAULT_ROOT = path.join("D:\\BaiQiuAI", "data", "memory");
const MAX_HISTORY_ITEMS = 50;

function cleanText(value, limit = 2000) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) {
      repairJson(file, fallback);
      return fallback;
    }
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch (error) {
    repairJson(file, fallback, error);
    return fallback;
  }
}

function repairJson(file, fallback, error = null) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.corrupt-${Date.now()}`);
    fs.writeFileSync(file, JSON.stringify(fallback, null, 2), "utf8");
    try {
      require("./neural-core/agent-event-bus").recordRuntimeMetric?.("MemoryCenter.repair", { duration: 0, success: true });
      if (error) require("./neural-core/agent-event-bus").writeDiagnostics?.({
        error: require("./neural-core/agent-event-bus").normalizeError?.(error, "NC6001", "memory_center")
      });
    } catch {}
  } catch {
    try { require("./neural-core/agent-event-bus").recordRuntimeMetric?.("MemoryCenter.repair", { duration: 0, success: false }); } catch {}
  }
}

function writeJsonAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp-${process.pid}-${Date.now()}-${randomUUID()}`;
  fs.writeFileSync(temp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(temp, file);
}

function defaultUser() {
  return {
    name: "",
    nickname: "",
    preferences: [],
    legacy: {},
    updatedAt: null
  };
}

function defaultContext() {
  return {
    project: {},
    skill: {},
    temporary: {},
    updatedAt: null
  };
}

function defaultSummary() {
  return {
    summaries: [],
    updatedAt: null
  };
}

function defaultHistory() {
  return {
    items: [],
    updatedAt: null
  };
}

function defaultExperience() {
  return {
    items: [],
    updatedAt: null
  };
}

class MemoryCenter {
  constructor({ root = DEFAULT_ROOT, clock = () => new Date(), stateManager = null, eventBus = null } = {}) {
    this.root = root;
    this.clock = typeof clock === "function" ? clock : () => new Date();
    this.stateManager = stateManager || getDefaultAgentStateManager();
    this.eventBus = eventBus || getDefaultAgentEventBus();
    this.files = {
      user: path.join(this.root, "user.json"),
      context: path.join(this.root, "context.json"),
      summary: path.join(this.root, "summary.json"),
      history: path.join(this.root, "history.json"),
      experience: path.join(this.root, "experience.json")
    };
    this.state = {
      user: defaultUser(),
      context: defaultContext(),
      summary: defaultSummary(),
      history: defaultHistory(),
      experience: defaultExperience()
    };
    this.load();
  }

  ensureRoot() {
    fs.mkdirSync(this.root, { recursive: true });
  }

  now() {
    return this.clock().toISOString();
  }

  load() {
    this.ensureRoot();
    this.state.user = { ...defaultUser(), ...readJson(this.files.user, defaultUser()) };
    this.state.context = { ...defaultContext(), ...readJson(this.files.context, defaultContext()) };
    this.state.summary = { ...defaultSummary(), ...readJson(this.files.summary, defaultSummary()) };
    this.state.history = { ...defaultHistory(), ...readJson(this.files.history, defaultHistory()) };
    this.state.experience = { ...defaultExperience(), ...readJson(this.files.experience, defaultExperience()) };
    if (!Array.isArray(this.state.user.preferences)) this.state.user.preferences = [];
    if (!this.state.user.legacy || typeof this.state.user.legacy !== "object") this.state.user.legacy = {};
    if (!Array.isArray(this.state.summary.summaries)) this.state.summary.summaries = [];
    if (!Array.isArray(this.state.history.items)) this.state.history.items = [];
    if (!Array.isArray(this.state.experience.items)) this.state.experience.items = [];
    return this.snapshot();
  }

  save() {
    this.ensureRoot();
    writeJsonAtomic(this.files.user, this.state.user);
    writeJsonAtomic(this.files.context, this.state.context);
    writeJsonAtomic(this.files.summary, this.state.summary);
    writeJsonAtomic(this.files.history, this.state.history);
    writeJsonAtomic(this.files.experience, this.state.experience);
    this.recordMemoryUpdate({ type: "memory_save", root: this.root });
    return this.snapshot();
  }

  snapshot() {
    return JSON.parse(JSON.stringify(this.state));
  }

  paths() {
    return { root: this.root, ...this.files };
  }

  getUser() {
    this.load();
    return { ...this.state.user, preferences: [...this.state.user.preferences], legacy: { ...this.state.user.legacy } };
  }

  setUserMemory(patch = {}, { source = "manual" } = {}) {
    this.load();
    const next = { ...this.state.user };
    const name = cleanText(patch.name, 60);
    const nickname = cleanText(patch.nickname, 60);
    if (name) next.name = name;
    if (nickname) next.nickname = nickname;
    if (Array.isArray(patch.preferences)) {
      const existing = new Set(next.preferences.map((item) => cleanText(item, 200)).filter(Boolean));
      for (const item of patch.preferences) {
        const clean = cleanText(item, 200);
        if (clean) existing.add(clean);
      }
      next.preferences = [...existing].slice(0, 100);
    }
    next.updatedAt = this.now();
    next.source = source;
    this.state.user = next;
    this.save();
    return { success: true, type: "user", user: this.getUser() };
  }

  setLegacy(key, value) {
    const cleanKey = cleanText(key, 80);
    const cleanValue = cleanText(value, 2000);
    if (!cleanKey || !cleanValue) throw new Error("memory key and value are required");
    this.load();
    this.state.user.legacy[cleanKey] = cleanValue;
    if (cleanKey === "用户称呼") {
      this.state.user.nickname = cleanValue;
      if (!this.state.user.name) this.state.user.name = cleanValue;
    }
    if (/偏好|习惯|回复|语言|中文|语气|风格|每次|以后/.test(`${cleanKey} ${cleanValue}`)) {
      const existing = new Set(this.state.user.preferences);
      existing.add(`${cleanKey}: ${cleanValue}`);
      this.state.user.preferences = [...existing].slice(0, 100);
    }
    this.state.user.updatedAt = this.now();
    this.save();
    return "好的，记住了。";
  }

  replaceLegacyMemory(memory = {}) {
    this.load();
    this.state.user.legacy = {};
    for (const [key, value] of Object.entries(memory || {})) {
      const cleanKey = cleanText(key, 80);
      const cleanValue = cleanText(value, 2000);
      if (cleanKey && cleanValue) this.state.user.legacy[cleanKey] = cleanValue;
    }
    const nickname = this.state.user.legacy["用户称呼"];
    if (nickname) {
      this.state.user.nickname = nickname;
      if (!this.state.user.name) this.state.user.name = nickname;
    }
    this.state.user.updatedAt = this.now();
    this.save();
    return this.getAll();
  }

  deleteLegacy(key) {
    const cleanKey = cleanText(key, 80);
    if (!cleanKey) throw new Error("delete_memory needs key");
    this.load();
    delete this.state.user.legacy[cleanKey];
    this.state.user.updatedAt = this.now();
    this.save();
    return `已删除记忆：${cleanKey}`;
  }

  getAll() {
    this.load();
    const user = this.state.user;
    const memory = { ...(user.legacy || {}) };
    if (user.name) memory["用户姓名"] = user.name;
    if (user.nickname) memory["用户称呼"] = user.nickname;
    if (user.preferences?.length) memory["用户偏好"] = user.preferences.join("；");
    return memory;
  }

  get(key) {
    return this.getAll()[cleanText(key, 80)] || null;
  }

  saveManualMemory(text, meta = {}) {
    const clean = cleanText(text, 2000);
    if (!clean) throw new Error("memory text is required");
    const remembered = this.rememberFromText(clean, { ...meta, explicit: true });
    if (remembered.saved) return remembered;
    this.appendHistory({ type: "manual_memory", text: clean, source: meta.source || "manual" });
    return { saved: true, type: "history", text: clean };
  }

  rememberFromText(message, meta = {}) {
    const text = cleanText(message, 2000);
    if (!text) return { saved: false, reason: "empty" };
    const userName = this.extractUserName(text);
    if (userName) {
      const result = this.setUserMemory({ name: userName, nickname: userName }, { source: meta.source || "user_message" });
      this.appendHistory({ type: "memory_update", memoryType: "user", field: "name", value: userName, source: meta.source || "user_message" });
      return { saved: true, type: "user", field: "name", value: userName, result };
    }
    const preference = this.extractPreference(text);
    if (preference) {
      const result = this.setUserMemory({ preferences: [preference] }, { source: meta.source || "user_message" });
      this.appendHistory({ type: "memory_update", memoryType: "user", field: "preferences", value: preference, source: meta.source || "user_message" });
      return { saved: true, type: "user", field: "preferences", value: preference, result };
    }
    return { saved: false, reason: "not_explicit_memory" };
  }

  extractUserName(text) {
    const patterns = [
      /(?:请记住|记住|帮我记住)?\s*我的名字叫\s*["“”']?([^"'“”。，,；;！!\n]{1,30})/i,
      /(?:请记住|记住|帮我记住)?\s*我叫\s*["“”']?([^"'“”。，,；;！!\n]{1,30})/i,
      /(?:请记住|记住|帮我记住)?\s*我是\s*["“”']?([^"'“”。，,；;！!\n]{1,30})/i,
      /(?:请记住|记住|帮我记住|以后)?\s*(?:叫我|称呼我)\s*["“”']?([^"'“”。，,；;！!\n]{1,30})/i
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      const value = cleanText(match?.[1] || "", 30).replace(/^(叫|是|为)\s*/, "");
      if (value && !/[?？]/.test(value)) return value;
    }
    return "";
  }

  extractPreference(text) {
    const patterns = [
      /(?:请记住|记住|帮我记住)\s*(?:我的)?(?:偏好|习惯|喜好)?[:：\s]*(.+)$/i,
      /(?:我的偏好是|我的习惯是|我喜欢|我不喜欢)[:：\s]*(.+)$/i
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      const value = cleanText(match?.[1] || "", 200);
      if (value && !this.extractUserName(text)) return value;
    }
    return "";
  }

  answerMemoryQuestion(message) {
    const text = cleanText(message, 200);
    if (!/^(我叫什么|我的名字是什么|我是谁|你记得我叫什么|你记得我的名字吗)[?？。!！]*$/.test(text)) return null;
    const user = this.getUser();
    const name = user.name || user.nickname || user.legacy?.["用户称呼"] || "";
    if (!name) return { answered: true, text: "我还没有记录您的名字。您可以说“我的名字叫……”让我记住。" };
    return { answered: true, text: `您叫${name}。` };
  }

  setProjectState(patch = {}) {
    this.load();
    this.state.context.project = {
      ...(this.state.context.project || {}),
      ...(patch || {}),
      updatedAt: this.now()
    };
    this.state.context.updatedAt = this.now();
    this.save();
    return { ...this.state.context.project };
  }

  getProjectState() {
    this.load();
    return { ...(this.state.context.project || {}) };
  }

  recordExperience(input = {}) {
    this.load();
    const item = {
      taskType: input.taskType || "",
      problem: cleanText(input.problem, 500),
      cause: cleanText(input.cause, 500),
      solution: cleanText(input.solution, 500),
      toolsUsed: Array.isArray(input.toolsUsed) ? input.toolsUsed.map((tool) => cleanText(tool, 120)).filter(Boolean) : [],
      relevance: Number.isFinite(Number(input.relevance)) ? Math.max(0, Math.min(1, Number(input.relevance))) : 0,
      usageCount: Math.max(0, Number(input.usageCount || 0)),
      successRate: Number.isFinite(Number(input.successRate)) ? Number(input.successRate) : 0,
      lastUsed: input.lastUsed || null,
      confidence: Number.isFinite(Number(input.confidence)) ? Math.max(0, Math.min(1, Number(input.confidence))) : 0.7,
      createdAt: input.createdAt || this.now()
    };
    const keyFor = (value) => [value.taskType, value.problem, value.cause, value.solution, (value.toolsUsed || []).join(",")].join("|").toLowerCase();
    const map = new Map((this.state.experience.items || []).map((old) => [keyFor(old), old]));
    map.set(keyFor(item), item);
    this.state.experience.items = Array.from(map.values()).slice(-500);
    this.state.experience.updatedAt = this.now();
    this.save();
    return item;
  }

  queryExperience({ taskType = "", toolId = "", problem = "", limit = 10 } = {}) {
    this.load();
    const normalize = (value) => String(value || "").toLowerCase();
    const task = normalize(taskType);
    const tool = normalize(toolId);
    const text = normalize(problem);
    const matches = (this.state.experience.items || [])
      .filter((item) => !task || normalize(item.taskType).includes(task) || task.includes(normalize(item.taskType)))
      .filter((item) => !tool || (item.toolsUsed || []).map(normalize).includes(tool))
      .filter((item) => !text || normalize(`${item.problem} ${item.cause} ${item.solution}`).includes(text))
      .map((item) => ({ ...item, relevance: this.experienceRelevance(item, { taskType, problem }) }))
      .sort((a, b) => (Number(b.relevance || 0) + Number(b.confidence || 0) + Number(b.successRate || 0)) - (Number(a.relevance || 0) + Number(a.confidence || 0) + Number(a.successRate || 0)))
      .slice(0, Math.max(1, Number(limit) || 10));
    this.markExperienceUsed(matches);
    return matches;
  }

  experienceRelevance(item = {}, { taskType = "", problem = "" } = {}) {
    const normalize = (value) => String(value || "").toLowerCase();
    const task = normalize(taskType);
    const text = normalize(problem);
    const itemTask = normalize(item.taskType);
    const haystack = normalize(`${item.problem} ${item.cause} ${item.solution} ${(item.toolsUsed || []).join(" ")}`);
    let score = 0;
    if (task && (itemTask.includes(task) || task.includes(itemTask))) score += 0.55;
    if (text && haystack && text.split(/\s+/).some((part) => part && haystack.includes(part))) score += 0.2;
    if (Number(item.successRate || 0) >= 0.8) score += 0.15;
    if (Number(item.confidence || 0) >= 0.8) score += 0.1;
    return Math.max(0, Math.min(1, Number(score.toFixed(2))));
  }

  markExperienceUsed(matches = []) {
    if (!matches.length) return;
    const keyFor = (value) => [value.taskType, value.problem, value.cause, value.solution, (value.toolsUsed || []).join(",")].join("|").toLowerCase();
    const keys = new Set(matches.map(keyFor));
    const now = this.now();
    this.state.experience.items = (this.state.experience.items || []).map((item) => {
      if (!keys.has(keyFor(item))) return item;
      return { ...item, usageCount: Number(item.usageCount || 0) + 1, lastUsed: now };
    });
    this.state.experience.updatedAt = now;
    this.save();
  }

  getExperienceMemory() {
    this.load();
    return { items: [...(this.state.experience.items || [])], updatedAt: this.state.experience.updatedAt || null };
  }

  appendHistory(entry = {}) {
    this.load();
    const item = {
      id: randomUUID(),
      at: this.now(),
      ...entry
    };
    this.state.history.items.push(item);
    this.state.history.updatedAt = this.now();
    this.compactHistoryIfNeeded(false);
    this.save();
    return item;
  }

  compactHistoryIfNeeded(shouldSave = true) {
    const items = this.state.history.items || [];
    if (items.length <= MAX_HISTORY_ITEMS) return { compacted: false };
    const overflow = items.splice(0, items.length - MAX_HISTORY_ITEMS);
    const summary = {
      id: randomUUID(),
      at: this.now(),
      count: overflow.length,
      text: overflow.map((item) => {
        const type = cleanText(item.type || "history", 40);
        const value = cleanText(item.value || item.text || item.field || "", 160);
        return value ? `${type}: ${value}` : type;
      }).join("\n").slice(0, 6000)
    };
    this.state.summary.summaries.push(summary);
    this.state.summary.summaries = this.state.summary.summaries.slice(-100);
    this.state.summary.updatedAt = this.now();
    this.state.history.items = items;
    if (shouldSave) this.save();
    return { compacted: true, summary };
  }

  recordMemoryUpdate(update = {}) {
    this.eventBus.publish(AGENT_EVENTS.MEMORY_UPDATED, {
      sessionId: "memory-center",
      ...update,
      at: this.now()
    });
  }

  formatForPrompt() {
    const user = this.getUser();
    const lines = [];
    if (user.name) lines.push(`- 用户姓名: ${user.name}`);
    if (user.nickname) lines.push(`- 用户称呼: ${user.nickname}`);
    for (const item of user.preferences || []) lines.push(`- 用户偏好: ${item}`);
    for (const [key, value] of Object.entries(user.legacy || {})) {
      if (key === "用户称呼" && value === user.nickname) continue;
      lines.push(`- ${key}: ${value}`);
    }
    const project = this.getProjectState();
    for (const [key, value] of Object.entries(project)) {
      if (key === "updatedAt") continue;
      lines.push(`- 项目记忆/${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`);
    }
    return lines.length ? lines.join("\n") : "（暂无记忆）";
  }
}

module.exports = { MemoryCenter, DEFAULT_ROOT };
