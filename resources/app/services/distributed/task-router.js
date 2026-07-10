class TaskRouter {
  constructor({ strategy = "capability" } = {}) {
    this.strategy = strategy;
  }

  route(task = {}, nodes = []) {
    const available = (Array.isArray(nodes) ? nodes : []).filter((node) => node && node.status !== "offline" && node.status !== "disabled");
    if (!available.length) {
      return {
        routed: false,
        nodeId: "",
        reason: "no_available_nodes"
      };
    }
    const toolId = task.toolId || task.contract?.toolId || "";
    const capable = available.filter((node) => this.canHandle(node, toolId));
    const candidates = capable.length ? capable : available;
    const selected = candidates
      .slice()
      .sort((a, b) => Number(a.load || 0) - Number(b.load || 0))[0];
    return {
      routed: true,
      nodeId: selected.nodeId || selected.id,
      node: selected,
      reason: capable.length ? "capability_match" : "fallback_available_node"
    };
  }

  canHandle(node = {}, toolId = "") {
    const capabilities = Array.isArray(node.capabilities) ? node.capabilities : [];
    if (!toolId) return true;
    return capabilities.includes("*") || capabilities.includes(toolId);
  }
}

module.exports = { TaskRouter };
