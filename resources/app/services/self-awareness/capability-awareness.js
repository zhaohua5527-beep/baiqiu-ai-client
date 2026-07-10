const fs = require("node:fs");
const path = require("node:path");
const { CapabilityCenter } = require("../capability-center");
const { DEFAULT_SELF_AWARENESS_ROOT } = require("./self-awareness-memory");

function nowIso() {
  return new Date().toISOString();
}

class CapabilityAwareness {
  constructor({ rootDir = DEFAULT_SELF_AWARENESS_ROOT, capabilityCenter = null } = {}) {
    this.rootDir = rootDir;
    this.filePath = path.join(rootDir, "capability-awareness.json");
    this.capabilityCenter = capabilityCenter || new CapabilityCenter();
    this.ensureStore();
  }

  assess({ taskType = "", requirements = [] } = {}) {
    const capabilities = this.capabilityCenter.listCapabilities?.() || [];
    const checks = requirements.map((requirement) => this.capabilityCenter.checkRequirement?.(requirement, { text: taskType }) || { available: true, status: "unknown", missing: [] });
    const missing = checks.flatMap((item) => item.missing || []);
    const availableCount = capabilities.filter((item) => item.status === "available").length;
    const result = {
      capabilityAwarenessId: `cap-aware-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      taskType,
      capabilityCount: capabilities.length,
      availableCount,
      missing,
      checks,
      ready: missing.length === 0,
      timestamp: nowIso(),
      safety: this.safety()
    };
    this.writeJson(this.filePath, result);
    return result;
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
    if (!fs.existsSync(this.filePath)) this.writeJson(this.filePath, { capabilityCount: 0, safety: this.safety() });
  }

  writeJson(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  }
}

module.exports = { CapabilityAwareness };
