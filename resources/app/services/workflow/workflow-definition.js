const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_WORKFLOW_ROOT = path.join("D:\\BaiQiuAI", "data", "workflows");

function nowIso() {
  return new Date().toISOString();
}

class WorkflowDefinition {
  constructor({ rootDir = DEFAULT_WORKFLOW_ROOT } = {}) {
    this.rootDir = rootDir;
    this.definitionsFile = path.join(rootDir, "workflow-definitions.json");
    this.ensureStore();
  }

  create({ goal = {}, lifecycle = {}, tasks = [], template = null, agentId = "default-agent" } = {}) {
    const nodes = tasks.map((task, index) => ({
      nodeId: `node-${index + 1}`,
      taskId: task.taskId || "",
      goalId: task.goalId || goal.goalId || "",
      name: task.name || task.type || `workflow node ${index + 1}`,
      type: task.type || "task",
      status: "pending",
      dependsOn: (task.dependsOn || []).map((dep) => {
        const depIndex = tasks.findIndex((item) => item.taskId === dep);
        return depIndex >= 0 ? `node-${depIndex + 1}` : dep;
      }),
      riskLevel: task.riskLevel || "low",
      lifecycleOnly: true
    }));
    const definition = {
      workflowId: `workflow-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      agentId,
      goalId: goal.goalId || lifecycle.goalId || "",
      lifecycleId: lifecycle.lifecycleId || "",
      taskType: goal.taskType || lifecycle.taskType || "",
      name: template?.name || goal.goal || lifecycle.sourceInput || "managed workflow",
      templateId: template?.templateId || "",
      nodes,
      edges: this.buildEdges(nodes),
      status: "defined",
      safety: this.safety(),
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    this.append(definition);
    return definition;
  }

  buildEdges(nodes = []) {
    const edges = [];
    for (const node of nodes) {
      for (const dep of node.dependsOn || []) edges.push({ from: dep, to: node.nodeId });
    }
    return edges;
  }

  get(workflowId = "") {
    return this.load().definitions[workflowId] || null;
  }

  append(definition = {}) {
    const data = this.load();
    data.definitions[definition.workflowId] = definition;
    this.writeJson(this.definitionsFile, { definitions: data.definitions });
  }

  load() {
    return this.readJson(this.definitionsFile, { definitions: {} });
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
    if (!fs.existsSync(this.definitionsFile)) this.writeJson(this.definitionsFile, { definitions: {} });
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

module.exports = { WorkflowDefinition, DEFAULT_WORKFLOW_ROOT };
