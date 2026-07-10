function nowIso() {
  return new Date().toISOString();
}

function makeContractId(taskId = "") {
  return `contract-${taskId || Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

class TaskContract {
  create(input = {}) {
    const task = input.task || input.step || {};
    return {
      contractId: input.contractId || makeContractId(task.id || task.taskId || ""),
      protocolVersion: input.protocolVersion || "agent-protocol/1.0",
      taskId: task.id || task.taskId || input.taskId || "",
      agent: input.agent || "ExecutorAgent",
      role: input.role || "execute",
      toolId: task.toolId || input.toolId || "",
      action: task.action || input.action || "",
      target: task.target || input.target || "",
      args: task.args || input.args || {},
      dependsOn: Array.isArray(task.dependsOn || input.dependsOn) ? [...(task.dependsOn || input.dependsOn)] : [],
      verifier: task.verifier || input.verifier || "",
      riskLevel: task.riskLevel || input.riskLevel || "low",
      requiresPermission: Boolean(task.requiresPermission ?? input.requiresPermission),
      needUserConfirm: Boolean(task.needUserConfirm ?? input.needUserConfirm),
      expectedOutput: input.expectedOutput || {},
      status: input.status || "created",
      createdAt: input.createdAt || nowIso()
    };
  }

  fromAssignment(assignment = {}) {
    return this.create({
      task: assignment.step || {},
      taskId: assignment.taskId || "",
      agent: assignment.agent || "",
      role: assignment.role || "",
      dependsOn: assignment.dependsOn || []
    });
  }
}

module.exports = { TaskContract };
