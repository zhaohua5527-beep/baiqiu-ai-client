const fs = require("node:fs");
const path = require("node:path");
const { DEFAULT_ATTENTION_ROOT } = require("./attention-priority-engine");

function nowIso() {
  return new Date().toISOString();
}

class AttentionMemory {
  constructor({ rootDir = DEFAULT_ATTENTION_ROOT, maxItems = 300 } = {}) {
    this.rootDir = rootDir;
    this.filePath = path.join(rootDir, "attention-memory.json");
    this.maxItems = maxItems;
    this.ensureStore();
  }

  remember(selection = {}) {
    const item = {
      memoryId: `att-mem-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      focus: selection.focus || "",
      selected: Array.isArray(selection.selected) ? selection.selected : [],
      dropped: Array.isArray(selection.dropped) ? selection.dropped : [],
      taskType: selection.taskType || "",
      reason: selection.reason || "",
      timestamp: selection.timestamp || nowIso(),
      safety: this.safety()
    };
    const data = this.load();
    data.items.push(item);
    this.writeJson(this.filePath, { items: data.items.slice(-this.maxItems) });
    return item;
  }

  recent(limit = 20) {
    return this.load().items.slice(-Math.max(1, Number(limit) || 20));
  }

  load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      return { items: Array.isArray(parsed.items) ? parsed.items : [] };
    } catch {
      return { items: [] };
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
    if (!fs.existsSync(this.filePath)) this.writeJson(this.filePath, { items: [] });
  }

  writeJson(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  }
}

module.exports = { AttentionMemory };
