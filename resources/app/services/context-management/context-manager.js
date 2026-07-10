// Experimental context implementation retained for compatibility.
// Runtime context entry remains services/context-manager.js until Neural Core owns context fully.

const fs = require("node:fs");
const path = require("node:path");
const { ContextBuilder } = require("./context-builder");
const { ContextPriorityEngine, DEFAULT_CONTEXT_MANAGEMENT_ROOT } = require("./context-priority-engine");
const { ContextWindowManager } = require("./context-window-manager");
const { ContextCompressor } = require("./context-compressor");

function nowIso() {
  return new Date().toISOString();
}

class ContextManager {
  constructor({
    rootDir = DEFAULT_CONTEXT_MANAGEMENT_ROOT,
    builder = null,
    priorityEngine = null,
    windowManager = null,
    compressor = null,
    maxContextSize = 24000
  } = {}) {
    this.rootDir = rootDir;
    this.filePath = path.join(rootDir, "context-manager.json");
    this.compressor = compressor || new ContextCompressor({ rootDir });
    this.priorityEngine = priorityEngine || new ContextPriorityEngine({ rootDir });
    this.windowManager = windowManager || new ContextWindowManager({ rootDir, maxContextSize, compressor: this.compressor });
    this.builder = builder || new ContextBuilder({ rootDir });
    this.ensureStore();
  }

  buildContext({ input = "", taskType = "", agentId = "default-agent", activeContext = [] } = {}) {
    const built = this.builder.build({ input, taskType, agentId, activeContext });
    const ranked = this.priorityEngine.rank(built.items, { input, taskType });
    const window = this.windowManager.fit(ranked, { query: { input, taskType } });
    const context = {
      contextId: `context-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      input,
      taskType,
      agentId,
      items: window.selected,
      compressed: window.compression,
      counts: built.counts,
      size: window.size,
      truncated: window.truncated,
      updatedAt: nowIso(),
      safety: this.safety()
    };
    this.saveContext(context);
    return context;
  }

  saveContext(context = {}) {
    const data = this.load();
    data.contexts.push(context);
    this.writeJson(this.filePath, { contexts: data.contexts.slice(-100), latestContextId: context.contextId || "", updatedAt: nowIso() });
  }

  getLatestContext() {
    const data = this.load();
    return data.contexts[data.contexts.length - 1] || null;
  }

  load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      return { contexts: Array.isArray(parsed.contexts) ? parsed.contexts : [] };
    } catch {
      return { contexts: [] };
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
    if (!fs.existsSync(this.filePath)) this.writeJson(this.filePath, { contexts: [], latestContextId: "", updatedAt: null });
  }

  writeJson(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  }
}

module.exports = { ContextManager, DEFAULT_CONTEXT_MANAGEMENT_ROOT };
