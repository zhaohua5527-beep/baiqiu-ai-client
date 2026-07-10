const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const DEFAULT_ROOT = path.join("D:\\BaiQiuAI", "data", "memory", "context");
const DEFAULT_MAX_CONTEXT_SIZE = 64000;
const DEFAULT_MAX_HISTORY_LENGTH = 50;
const KEEP_RECENT_MESSAGES = 30;

function cleanText(value, limit = 4000) {
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
      require("./neural-core/agent-event-bus").recordRuntimeMetric?.("ContextManager.repair", { duration: 0, success: true });
      if (error) require("./neural-core/agent-event-bus").writeDiagnostics?.({
        error: require("./neural-core/agent-event-bus").normalizeError?.(error, "NC6001", "context_manager")
      });
    } catch {}
  } catch {
    try { require("./neural-core/agent-event-bus").recordRuntimeMetric?.("ContextManager.repair", { duration: 0, success: false }); } catch {}
  }
}

function writeJsonAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp-${process.pid}-${Date.now()}-${randomUUID()}`;
  fs.writeFileSync(temp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(temp, file);
}

function defaultActive() {
  return {
    version: 1,
    messages: [],
    currentTask: null,
    currentStep: "",
    sessions: {},
    updatedAt: null
  };
}

function defaultSummary() {
  return {
    version: 1,
    summaries: [],
    project: {},
    preferences: [],
    importantDecisions: [],
    openTasks: [],
    updatedAt: null
  };
}

function defaultArchive() {
  return {
    version: 1,
    items: [],
    updatedAt: null
  };
}

class ContextManager {
  constructor({
    root = DEFAULT_ROOT,
    maxContextSize = DEFAULT_MAX_CONTEXT_SIZE,
    maxHistoryLength = DEFAULT_MAX_HISTORY_LENGTH,
    clock = () => new Date()
  } = {}) {
    this.root = root;
    this.maxContextSize = Number(maxContextSize) || DEFAULT_MAX_CONTEXT_SIZE;
    this.maxHistoryLength = Number(maxHistoryLength) || DEFAULT_MAX_HISTORY_LENGTH;
    this.clock = typeof clock === "function" ? clock : () => new Date();
    this.compressionLock = false;
    this.files = {
      active: path.join(this.root, "active.json"),
      summary: path.join(this.root, "summary.json"),
      archive: path.join(this.root, "archive.json")
    };
    this.state = {
      active: defaultActive(),
      summary: defaultSummary(),
      archive: defaultArchive()
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
    this.state.active = { ...defaultActive(), ...readJson(this.files.active, defaultActive()) };
    this.state.summary = { ...defaultSummary(), ...readJson(this.files.summary, defaultSummary()) };
    this.state.archive = { ...defaultArchive(), ...readJson(this.files.archive, defaultArchive()) };
    if (!Array.isArray(this.state.active.messages)) this.state.active.messages = [];
    if (!this.state.active.sessions || typeof this.state.active.sessions !== "object") this.state.active.sessions = {};
    if (!Array.isArray(this.state.summary.summaries)) this.state.summary.summaries = [];
    if (!Array.isArray(this.state.summary.preferences)) this.state.summary.preferences = [];
    if (!Array.isArray(this.state.summary.importantDecisions)) this.state.summary.importantDecisions = [];
    if (!Array.isArray(this.state.summary.openTasks)) this.state.summary.openTasks = [];
    if (!Array.isArray(this.state.archive.items)) this.state.archive.items = [];
    return this.snapshot();
  }

  save() {
    this.ensureRoot();
    writeJsonAtomic(this.files.active, this.state.active);
    writeJsonAtomic(this.files.summary, this.state.summary);
    writeJsonAtomic(this.files.archive, this.state.archive);
    return this.snapshot();
  }

  snapshot() {
    return JSON.parse(JSON.stringify(this.state));
  }

  paths() {
    return { root: this.root, ...this.files };
  }

  getActiveContext(sessionId = "") {
    this.load();
    const messages = sessionId
      ? this.state.active.messages.filter((item) => item.sessionId === sessionId)
      : this.state.active.messages;
    return {
      active: {
        messages: messages.slice(-KEEP_RECENT_MESSAGES),
        currentTask: sessionId ? this.state.active.sessions?.[sessionId]?.currentTask || this.state.active.currentTask : this.state.active.currentTask,
        currentStep: sessionId ? this.state.active.sessions?.[sessionId]?.currentStep || this.state.active.currentStep : this.state.active.currentStep
      },
      summary: {
        summaries: this.state.summary.summaries.slice(-20),
        project: { ...(this.state.summary.project || {}) },
        preferences: [...this.state.summary.preferences],
        importantDecisions: this.state.summary.importantDecisions.slice(-30),
        openTasks: this.state.summary.openTasks.slice(-30)
      },
      limits: {
        maxContextSize: this.maxContextSize,
        maxHistoryLength: this.maxHistoryLength,
        compressionLocked: this.compressionLock
      }
    };
  }

  appendMessage(sessionId, message = {}) {
    this.load();
    const text = cleanText(message.text || "", 3000);
    if (!sessionId || !message.role || !text) return { appended: false };
    const item = {
      id: message.id || randomUUID(),
      sessionId,
      role: message.role,
      text,
      createdAt: message.createdAt || Date.now(),
      at: this.now()
    };
    this.state.active.messages.push(item);
    this.state.active.updatedAt = this.now();
    this.state.active.sessions[sessionId] = {
      ...(this.state.active.sessions[sessionId] || {}),
      lastMessageAt: item.at
    };
    this.extractImportantFacts(item);
    const compression = this.compressIfNeeded();
    this.save();
    return { appended: true, compression };
  }

  updateTaskState(sessionId, patch = {}) {
    this.load();
    if (!sessionId) return null;
    const task = {
      sessionId,
      status: cleanText(patch.status || "", 80),
      intent: cleanText(patch.intent || patch.agent?.intent || "", 120),
      tool: cleanText(patch.logicalTool || patch.toolId || patch.agent?.logicalTool || "", 120),
      plan: Array.isArray(patch.plan) ? patch.plan.slice(0, 20) : [],
      updatedAt: this.now()
    };
    this.state.active.currentTask = task;
    this.state.active.currentStep = task.status;
    this.state.active.sessions[sessionId] = {
      ...(this.state.active.sessions[sessionId] || {}),
      currentTask: task,
      currentStep: task.status,
      updatedAt: task.updatedAt
    };
    if (task.status && !["done", "completed", "success", "failed", "aborted", "cancelled"].includes(task.status)) {
      this.addUnique(this.state.summary.openTasks, `${task.status}: ${task.intent || task.tool || sessionId}`, 80);
    }
    this.state.active.updatedAt = this.now();
    this.save();
    return task;
  }

  extractImportantFacts(item) {
    if (item.role !== "user") return;
    const text = item.text;
    const projectName = this.extractProjectName(text);
    if (projectName) {
      this.state.summary.project.name = projectName;
      this.state.summary.project.updatedAt = this.now();
    }
    const preference = this.extractPreference(text);
    if (preference) this.addUnique(this.state.summary.preferences, preference, 80);
    const decision = this.extractDecision(text);
    if (decision) this.addUnique(this.state.summary.importantDecisions, decision, 80);
  }

  extractProjectName(text) {
    const match = text.match(/(?:我的项目叫|项目叫|项目名称是|项目名是)\s*([^。！!，,；;\n]{1,60})/i);
    return cleanText(match?.[1] || "", 60);
  }

  extractPreference(text) {
    const match = text.match(/(?:以后|后续|下次).{0,20}(?:都|要|请|必须)\s*([^。！!；;\n]{2,120})/i);
    return cleanText(match?.[0] || "", 140);
  }

  extractDecision(text) {
    if (!/(决定|确认|验收通过|进入Phase|进入 Phase|阶段|架构)/i.test(text)) return "";
    return cleanText(text, 180);
  }

  answerContextQuestion(message) {
    const text = cleanText(message, 200);
    if (!/^(我的项目叫什么|项目叫什么|当前项目叫什么)[?？。!！]*$/.test(text)) return null;
    this.load();
    const name = this.state.summary.project?.name || "";
    if (!name) return { answered: true, text: "我还没有记录当前项目名称。" };
    return { answered: true, text: `您的项目叫${name}。` };
  }

  compressIfNeeded(force = false) {
    if (this.compressionLock) return { compressed: false, reason: "locked" };
    const size = Buffer.byteLength(JSON.stringify(this.state.active), "utf8");
    const tooLarge = size >= Math.floor(this.maxContextSize * 0.8);
    const tooMany = this.state.active.messages.length > this.maxHistoryLength;
    if (!force && !tooLarge && !tooMany) return { compressed: false, size, messageCount: this.state.active.messages.length };
    return this.compress({ reason: force ? "forced" : tooLarge ? "size" : "message_count", size });
  }

  compress({ reason = "manual", size = 0 } = {}) {
    this.compressionLock = true;
    try {
      const messages = this.state.active.messages;
      if (messages.length <= KEEP_RECENT_MESSAGES) return { compressed: false, reason: "within_recent_window" };
      const oldMessages = messages.slice(0, Math.max(0, messages.length - KEEP_RECENT_MESSAGES));
      const recentMessages = messages.slice(-KEEP_RECENT_MESSAGES);
      const summary = this.summarizeMessages(oldMessages, reason, size);
      if (summary) {
        this.state.summary.summaries.push(summary);
        this.state.summary.summaries = this.state.summary.summaries.slice(-120);
        this.state.summary.updatedAt = this.now();
        this.state.archive.items.push({
          id: summary.id,
          at: summary.at,
          reason,
          messageCount: oldMessages.length,
          summary: summary.text
        });
        this.state.archive.items = this.state.archive.items.slice(-200);
        this.state.archive.updatedAt = this.now();
      }
      this.state.active.messages = recentMessages;
      this.state.active.updatedAt = this.now();
      return { compressed: true, reason, archived: oldMessages.length, remaining: recentMessages.length, summaryId: summary?.id || "" };
    } finally {
      this.compressionLock = false;
    }
  }

  summarizeMessages(messages = [], reason = "manual", size = 0) {
    if (!messages.length) return null;
    const userItems = messages.filter((item) => item.role === "user").map((item) => item.text);
    const assistantItems = messages.filter((item) => item.role === "assistant").map((item) => item.text);
    const important = [...userItems, ...assistantItems]
      .filter((text) => /(项目|Phase|阶段|架构|任务|创建|失败|成功|验证|记住|偏好|决定|能力|技能|Memory|Context|Tool|Agent)/i.test(text))
      .slice(-20);
    const text = [
      `压缩原因：${reason}`,
      `压缩消息数：${messages.length}`,
      size ? `压缩前大小：${size}` : "",
      this.state.summary.project?.name ? `项目：${this.state.summary.project.name}` : "",
      this.state.summary.openTasks.length ? `未完成任务：${this.state.summary.openTasks.slice(-10).join("；")}` : "",
      important.length ? "重要内容：" : "",
      ...important.map((item) => `- ${cleanText(item, 220)}`)
    ].filter(Boolean).join("\n").slice(0, 8000);
    return {
      id: randomUUID(),
      at: this.now(),
      reason,
      messageCount: messages.length,
      text
    };
  }

  addUnique(list, value, limit = 50) {
    const clean = cleanText(value, 220);
    if (!clean) return;
    const next = [clean, ...list.filter((item) => item !== clean)];
    list.splice(0, list.length, ...next.slice(0, limit));
  }
}

module.exports = { ContextManager, DEFAULT_ROOT };
