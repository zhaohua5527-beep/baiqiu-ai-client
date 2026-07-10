const fs = require("node:fs");
const path = require("node:path");
const { AttentionPriorityEngine, DEFAULT_ATTENTION_ROOT } = require("./attention-priority-engine");

function nowIso() {
  return new Date().toISOString();
}

class AttentionSelector {
  constructor({ rootDir = DEFAULT_ATTENTION_ROOT, priorityEngine = null, maxFocusItems = 8 } = {}) {
    this.rootDir = rootDir;
    this.filePath = path.join(rootDir, "attention-selector.json");
    this.priorityEngine = priorityEngine || new AttentionPriorityEngine({ rootDir });
    this.maxFocusItems = maxFocusItems;
    this.ensureStore();
  }

  select(signals = [], query = {}) {
    const ranked = this.priorityEngine.rank(signals, query);
    const selected = ranked.slice(0, Math.max(1, Number(query.limit || this.maxFocusItems)));
    const dropped = ranked.slice(selected.length);
    const focus = selected[0]?.content || selected[0]?.reason || selected[0]?.source || "";
    const result = {
      selectionId: `att-select-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      focus,
      selected,
      dropped,
      taskType: query.taskType || "",
      reason: selected.length ? "highest_priority_attention_signals" : "no_attention_signal",
      timestamp: nowIso(),
      safety: this.safety()
    };
    this.writeJson(this.filePath, {
      selectionId: result.selectionId,
      focus: result.focus,
      selectedCount: selected.length,
      droppedCount: dropped.length,
      updatedAt: result.timestamp,
      safety: result.safety
    });
    return result;
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
    if (!fs.existsSync(this.filePath)) this.writeJson(this.filePath, { selectedCount: 0, droppedCount: 0, safety: this.safety() });
  }

  writeJson(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  }
}

module.exports = { AttentionSelector };
