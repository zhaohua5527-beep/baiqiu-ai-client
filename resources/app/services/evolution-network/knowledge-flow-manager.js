const fs = require("node:fs");
const path = require("node:path");
const { DEFAULT_EVOLUTION_NETWORK_ROOT } = require("./evolution-graph");

function nowIso() {
  return new Date().toISOString();
}

class KnowledgeFlowManager {
  constructor({ rootDir = DEFAULT_EVOLUTION_NETWORK_ROOT } = {}) {
    this.rootDir = rootDir;
    this.flowFile = path.join(rootDir, "knowledge-flow.json");
    this.ensureStore();
  }

  mapFlows({ experience = [], reflection = [], learning = null, evolution = null, taskType = "" } = {}) {
    const flows = [];
    for (const item of experience) {
      flows.push({
        flow: "Experience -> Knowledge",
        taskType,
        source: item.errorType || item.failedReason || "experience",
        target: item.solution || item.toolId || "knowledge",
        status: item.success === true ? "verified" : "observed"
      });
    }
    for (const item of reflection) {
      flows.push({
        flow: "Reflection -> Improvement",
        taskType,
        source: item.mistake || item.reason || "reflection",
        target: item.improvement || "improvement",
        status: item.status || "reviewed"
      });
    }
    for (const hint of (learning?.learningHints || learning?.hints || [])) {
      flows.push({
        flow: "Learning -> Strategy",
        taskType,
        source: hint.type || "learning",
        target: hint.suggestion || "strategy",
        status: "advisory"
      });
    }
    for (const item of (evolution?.recommendations || [])) {
      flows.push({
        flow: "Evolution -> Capability",
        taskType,
        source: item.type || "evolution",
        target: item.target || "capability",
        status: "advisory"
      });
    }
    const report = {
      taskType,
      flows,
      flowCount: flows.length,
      timestamp: nowIso(),
      safety: this.safety()
    };
    this.writeJson(this.flowFile, report);
    return report;
  }

  safety() {
    return {
      flowOnly: true,
      advisoryOnly: true,
      executesTool: false,
      modifiesPermission: false,
      bypassesToolSelector: false,
      bypassesVerifierCenter: false
    };
  }

  ensureStore() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.flowFile)) this.writeJson(this.flowFile, { flows: [], safety: this.safety() });
  }

  writeJson(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  }
}

module.exports = { KnowledgeFlowManager };
