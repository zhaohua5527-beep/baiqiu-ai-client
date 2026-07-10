const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_SELF_AWARENESS_ROOT = path.join("D:\\BaiQiuAI", "data", "self-awareness");

function nowIso() {
  return new Date().toISOString();
}

class SelfAwarenessMemory {
  constructor({ rootDir = DEFAULT_SELF_AWARENESS_ROOT, maxItems = 300 } = {}) {
    this.rootDir = rootDir;
    this.filePath = path.join(rootDir, "self-awareness-memory.json");
    this.maxItems = maxItems;
    this.ensureStore();
  }

  record(input = {}) {
    const item = {
      awarenessId: input.awarenessId || `self-aware-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      agentId: input.agentId || "default-agent",
      taskType: input.taskType || "",
      state: input.state || null,
      capability: input.capability || null,
      limitations: Array.isArray(input.limitations) ? input.limitations : [],
      summary: input.summary || "",
      timestamp: input.timestamp || nowIso(),
      safety: this.safety()
    };
    const data = this.load();
    data.items.push(item);
    this.writeJson(this.filePath, { items: data.items.slice(-this.maxItems) });
    return item;
  }

  query({ taskType = "", limit = 20 } = {}) {
    return this.load().items
      .filter((item) => !taskType || item.taskType === taskType)
      .slice(-Math.max(1, Number(limit) || 20));
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
      selfAwarenessOnly: true,
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

module.exports = { SelfAwarenessMemory, DEFAULT_SELF_AWARENESS_ROOT };
