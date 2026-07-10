const fs = require("node:fs");
const path = require("node:path");
const { DEFAULT_ATTENTION_ROOT } = require("./attention-priority-engine");

function nowIso() {
  return new Date().toISOString();
}

class AttentionMonitor {
  constructor({ rootDir = DEFAULT_ATTENTION_ROOT, maxEvents = 300 } = {}) {
    this.rootDir = rootDir;
    this.filePath = path.join(rootDir, "attention-monitor.json");
    this.maxEvents = maxEvents;
    this.ensureStore();
  }

  record(event = {}) {
    const item = {
      eventId: `att-event-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      event: event.event || "attention.update",
      status: event.status || "ok",
      focus: event.focus || "",
      selectedCount: Number(event.selectedCount || 0),
      droppedCount: Number(event.droppedCount || 0),
      warnings: Array.isArray(event.warnings) ? event.warnings : [],
      timestamp: event.timestamp || nowIso(),
      safety: this.safety()
    };
    const data = this.load();
    data.events.push(item);
    this.writeJson(this.filePath, { events: data.events.slice(-this.maxEvents) });
    return item;
  }

  getStatus() {
    const events = this.load().events;
    const last = events[events.length - 1] || null;
    return {
      status: last?.status || "idle",
      last,
      eventCount: events.length,
      safety: this.safety()
    };
  }

  load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      return { events: Array.isArray(parsed.events) ? parsed.events : [] };
    } catch {
      return { events: [] };
    }
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
    if (!fs.existsSync(this.filePath)) this.writeJson(this.filePath, { events: [] });
  }

  writeJson(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  }
}

module.exports = { AttentionMonitor };
