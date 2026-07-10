const fs = require("node:fs");
const path = require("node:path");
const { ExecutionNode } = require("./execution-node");

const DEFAULT_DISTRIBUTED_ROOT = path.join("D:\\BaiQiuAI", "data", "distributed");

class NodeManager {
  constructor({ rootDir = DEFAULT_DISTRIBUTED_ROOT, nodes = [] } = {}) {
    this.rootDir = rootDir;
    this.nodesFile = path.join(rootDir, "nodes.json");
    this.nodes = new Map();
    this.ensureStore();
    for (const node of nodes) this.registerNode(node);
    if (!this.nodes.size) this.registerNode(new ExecutionNode({ nodeId: "local-executor", name: "Local Executor", capabilities: ["*"] }));
  }

  registerNode(node) {
    const instance = node instanceof ExecutionNode ? node : new ExecutionNode(node || {});
    this.nodes.set(instance.nodeId, instance);
    this.persist();
    return instance.describe();
  }

  getNode(nodeId = "") {
    return this.nodes.get(nodeId) || null;
  }

  listNodes() {
    return Array.from(this.nodes.values()).map((node) => node.describe());
  }

  setStatus(nodeId = "", status = "idle") {
    const node = this.getNode(nodeId);
    if (!node) return null;
    node.status = status;
    this.persist();
    return node.describe();
  }

  async executeOnNode(nodeId = "", assignment = {}, context = {}) {
    const node = this.getNode(nodeId);
    if (!node) {
      return {
        nodeId,
        taskId: assignment.taskId || "",
        success: false,
        status: "failed",
        error: "node_not_found"
      };
    }
    const result = await node.execute(assignment, context);
    this.persist();
    return result;
  }

  ensureStore() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.nodesFile)) this.writeJson(this.nodesFile, { nodes: [] });
  }

  persist() {
    this.writeJson(this.nodesFile, { nodes: this.listNodes() });
  }

  writeJson(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  }
}

module.exports = { NodeManager, DEFAULT_DISTRIBUTED_ROOT };
