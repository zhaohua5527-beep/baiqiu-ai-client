const fs = require("node:fs");
const path = require("node:path");
const { DEFAULT_CONTEXT_MANAGEMENT_ROOT } = require("./context-priority-engine");
const { ContextCompressor } = require("./context-compressor");

function nowIso() {
  return new Date().toISOString();
}

function estimateSize(item = {}) {
  return JSON.stringify(item).length;
}

class ContextWindowManager {
  constructor({ rootDir = DEFAULT_CONTEXT_MANAGEMENT_ROOT, maxContextSize = 24000, compressor = null } = {}) {
    this.rootDir = rootDir;
    this.filePath = path.join(rootDir, "context-window.json");
    this.maxContextSize = maxContextSize;
    this.compressor = compressor || new ContextCompressor({ rootDir });
    this.ensureStore();
  }

  fit(items = [], { query = {}, preserveCritical = true } = {}) {
    const selected = [];
    const overflow = [];
    let used = 0;
    for (const item of items) {
      const size = estimateSize(item);
      const mustKeep = preserveCritical && item.critical === true;
      if (mustKeep || used + size <= this.maxContextSize) {
        selected.push(item);
        used += size;
      } else {
        overflow.push(item);
      }
    }
    const compression = overflow.length > 0 ? this.compressor.compress(overflow, { reason: "context_window_limit", query }) : null;
    const window = {
      selected,
      overflow,
      compression,
      size: used,
      maxContextSize: this.maxContextSize,
      truncated: overflow.length > 0,
      updatedAt: nowIso(),
      safety: this.safety()
    };
    this.writeJson(this.filePath, {
      size: window.size,
      maxContextSize: window.maxContextSize,
      selectedCount: selected.length,
      overflowCount: overflow.length,
      compressionId: compression?.compressionId || "",
      updatedAt: window.updatedAt,
      safety: this.safety()
    });
    return window;
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
    if (!fs.existsSync(this.filePath)) this.writeJson(this.filePath, { size: 0, maxContextSize: this.maxContextSize, safety: this.safety() });
  }

  writeJson(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  }
}

module.exports = { ContextWindowManager };
