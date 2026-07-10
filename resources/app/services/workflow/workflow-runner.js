const fs = require("node:fs");
const path = require("node:path");
const { AutonomyLevelManager } = require("../autonomy/autonomy-level-manager");
const { DEFAULT_WORKFLOW_ROOT } = require("./workflow-definition");

function nowIso() {
  return new Date().toISOString();
}

class WorkflowRunner {
  constructor({ rootDir = DEFAULT_WORKFLOW_ROOT, autonomyLevelManager = null } = {}) {
    this.rootDir = rootDir;
    this.runsFile = path.join(rootDir, "workflow-runs.json");
    this.autonomyLevelManager = autonomyLevelManager || new AutonomyLevelManager();
    this.ensureStore();
  }

  start(definition = {}) {
    const autonomy = this.autonomyLevelManager.getLevel(definition.agentId || "default-agent");
    const run = {
      runId: `run-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      workflowId: definition.workflowId || "",
      agentId: definition.agentId || "default-agent",
      status: "running",
      autonomyLevel: autonomy.level,
      nodes: (definition.nodes || []).map((node) => ({ ...node })),
      currentNodeId: "",
      history: [{ event: "workflow_started", timestamp: nowIso() }],
      safety: this.safety(),
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    this.saveRun(run);
    return run;
  }

  advance(runId = "", { nodeId = "", status = "completed", note = "" } = {}) {
    const run = this.getRun(runId);
    if (!run) return null;
    const nextNode = nodeId ? run.nodes.find((node) => node.nodeId === nodeId) : this.nextReadyNode(run);
    if (!nextNode) {
      run.status = run.nodes.every((node) => node.status === "completed") ? "completed" : "blocked";
      run.updatedAt = nowIso();
      run.history.push({ event: "workflow_no_ready_node", status: run.status, note, timestamp: run.updatedAt });
      this.saveRun(run);
      return run;
    }
    nextNode.status = status;
    run.currentNodeId = nextNode.nodeId;
    if (run.nodes.every((node) => node.status === "completed")) run.status = "completed";
    run.updatedAt = nowIso();
    run.history.push({ event: "workflow_node_updated", nodeId: nextNode.nodeId, status, note, timestamp: run.updatedAt });
    this.saveRun(run);
    return run;
  }

  nextReadyNode(run = {}) {
    return (run.nodes || []).find((node) => {
      if (node.status !== "pending") return false;
      return (node.dependsOn || []).every((dep) => run.nodes.some((candidate) => candidate.nodeId === dep && candidate.status === "completed"));
    }) || null;
  }

  getRun(runId = "") {
    return this.load().runs[runId] || null;
  }

  saveRun(run = {}) {
    const data = this.load();
    data.runs[run.runId] = run;
    this.writeJson(this.runsFile, { runs: data.runs });
  }

  load() {
    return this.readJson(this.runsFile, { runs: {} });
  }

  safety() {
    return {
      workflowOnly: true,
      executesTool: false,
      bypassesToolSelector: false,
      bypassesVerifierCenter: false
    };
  }

  ensureStore() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.runsFile)) this.writeJson(this.runsFile, { runs: {} });
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

module.exports = { WorkflowRunner };
