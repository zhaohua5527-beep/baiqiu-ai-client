const fs = require("node:fs");
const path = require("node:path");
const { dataRoot } = require("../data-root");

const DEFAULT_TASK_LIFECYCLE_ROOT = path.join(dataRoot(), "task-lifecycle");

function nowIso() {
  return new Date().toISOString();
}

class TaskHistoryManager {
  constructor({ rootDir = DEFAULT_TASK_LIFECYCLE_ROOT, maxItems = 1000 } = {}) {
    this.rootDir = rootDir;
    this.historyFile = path.join(rootDir, "task-history.json");
    this.maxItems = maxItems;
    this.ensureStore();
  }

  record(event = {}) {
    const item = {
      eventId: event.eventId || `task-event-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      taskId: event.taskId || "",
      goalId: event.goalId || "",
      agentId: event.agentId || "default-agent",
      event: event.event || "task_event",
      from: event.from || "",
      to: event.to || "",
      reason: event.reason || "",
      metadata: event.metadata || {},
      safety: {
        lifecycleOnly: true,
        executesTool: false,
        bypassesToolSelector: false,
        bypassesVerifierCenter: false
      },
      timestamp: event.timestamp || nowIso()
    };
    const data = this.load();
    data.history.push(item);
    this.writeJson(this.historyFile, { history: data.history.slice(-this.maxItems) });
    return item;
  }

  list({ taskId = "", goalId = "", agentId = "" } = {}) {
    return this.load().history
      .filter((item) => !taskId || item.taskId === taskId)
      .filter((item) => !goalId || item.goalId === goalId)
      .filter((item) => !agentId || item.agentId === agentId);
  }

  load() {
    return this.readJson(this.historyFile, { history: [] });
  }

  ensureStore() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.historyFile)) this.writeJson(this.historyFile, { history: [] });
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

module.exports = { TaskHistoryManager, DEFAULT_TASK_LIFECYCLE_ROOT };
