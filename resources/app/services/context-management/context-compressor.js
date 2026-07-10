const fs = require("node:fs");
const path = require("node:path");
const { DEFAULT_CONTEXT_MANAGEMENT_ROOT } = require("./context-priority-engine");

function nowIso() {
  return new Date().toISOString();
}

function textOf(item = {}) {
  return String(item.content || item.summary || item.goal || item.name || item.concept || item.source || "").replace(/\s+/g, " ").trim();
}

class ContextCompressor {
  constructor({ rootDir = DEFAULT_CONTEXT_MANAGEMENT_ROOT, maxSummaryItems = 80 } = {}) {
    this.rootDir = rootDir;
    this.filePath = path.join(rootDir, "context-compressed.json");
    this.maxSummaryItems = maxSummaryItems;
    this.ensureStore();
  }

  compress(items = [], { reason = "window_limit" } = {}) {
    const grouped = new Map();
    for (const item of items) {
      const scope = item.scope || item.type || "context";
      const text = textOf(item);
      if (!text) continue;
      if (!grouped.has(scope)) grouped.set(scope, []);
      grouped.get(scope).push(text);
    }
    const summary = Array.from(grouped.entries()).map(([scope, values]) => ({
      scope,
      count: values.length,
      summary: values.slice(0, 5).join(" | ").slice(0, 1500)
    }));
    const record = {
      compressionId: `ctx-compress-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      reason,
      inputCount: items.length,
      summary,
      timestamp: nowIso(),
      safety: this.safety()
    };
    const data = this.load();
    data.compressions.push(record);
    this.writeJson(this.filePath, { compressions: data.compressions.slice(-this.maxSummaryItems) });
    return record;
  }

  load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      return { compressions: Array.isArray(parsed.compressions) ? parsed.compressions : [] };
    } catch {
      return { compressions: [] };
    }
  }

  safety() {
    return {
      contextOnly: true,
      executesTool: false,
      bypassesToolSelector: false,
      bypassesVerifierCenter: false
    };
  }

  ensureStore() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.filePath)) this.writeJson(this.filePath, { compressions: [] });
  }

  writeJson(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  }
}

module.exports = { ContextCompressor };
