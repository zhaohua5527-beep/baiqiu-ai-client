function nowIso() {
  return new Date().toISOString();
}

class ExecutionNode {
  constructor({ nodeId = "", name = "", capabilities = ["*"], executor = null } = {}) {
    this.nodeId = nodeId || `node-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    this.name = name || this.nodeId;
    this.capabilities = capabilities;
    this.executor = executor;
    this.status = "idle";
    this.load = 0;
    this.lastResult = null;
  }

  describe() {
    return {
      nodeId: this.nodeId,
      name: this.name,
      capabilities: this.capabilities,
      status: this.status,
      load: this.load
    };
  }

  async execute(assignment = {}, context = {}) {
    this.status = "running";
    this.load += 1;
    const startedAt = Date.now();
    try {
      const result = this.executor
        ? await this.executor(assignment, context)
        : this.defaultResult(assignment);
      this.status = "idle";
      this.load = Math.max(0, this.load - 1);
      this.lastResult = {
        nodeId: this.nodeId,
        assignmentId: assignment.id || "",
        taskId: assignment.taskId || assignment.contract?.taskId || "",
        success: result?.success !== false,
        status: result?.status || (result?.success === false ? "failed" : "success"),
        result: result?.result ?? result,
        duration: Date.now() - startedAt,
        timestamp: nowIso()
      };
      return this.lastResult;
    } catch (error) {
      this.status = "idle";
      this.load = Math.max(0, this.load - 1);
      this.lastResult = {
        nodeId: this.nodeId,
        assignmentId: assignment.id || "",
        taskId: assignment.taskId || assignment.contract?.taskId || "",
        success: false,
        status: "failed",
        error: error?.message || String(error),
        duration: Date.now() - startedAt,
        timestamp: nowIso()
      };
      return this.lastResult;
    }
  }

  defaultResult(assignment = {}) {
    return {
      success: true,
      status: "scheduled",
      result: {
        taskId: assignment.taskId || assignment.contract?.taskId || "",
        toolId: assignment.step?.toolId || assignment.contract?.toolId || "",
        note: "scheduled_for_existing_executor_chain"
      }
    };
  }
}

module.exports = { ExecutionNode };
