function nowIso() {
  return new Date().toISOString();
}

class CollaborationProtocol {
  constructor({ eventBus = null } = {}) {
    this.eventBus = eventBus;
    this.transfers = [];
  }

  createTransfer({ fromAgent = "", toAgent = "", taskId = "", deliverable = "", input = null, output = null, status = "pending" } = {}) {
    const transfer = {
      fromAgent,
      toAgent,
      taskId,
      deliverable,
      input,
      output,
      status,
      timestamp: nowIso()
    };
    this.validateTransfer(transfer);
    this.transfers.push(transfer);
    this.eventBus?.publish?.("TASK_TRANSFERRED", transfer);
    return transfer;
  }

  completeTransfer(taskId, output = null) {
    const transfer = [...this.transfers].reverse().find((item) => item.taskId === taskId);
    if (!transfer) return null;
    transfer.output = output;
    transfer.status = "completed";
    transfer.timestamp = nowIso();
    this.eventBus?.publish?.("AGENT_COMPLETED", {
      agentId: transfer.toAgent,
      taskId,
      output
    });
    return transfer;
  }

  validateTransfer(transfer = {}) {
    for (const key of ["fromAgent", "toAgent", "taskId", "status", "timestamp"]) {
      if (!transfer[key]) throw new Error(`Invalid collaboration transfer: missing ${key}`);
    }
    return true;
  }

  listTransfers() {
    return this.transfers.map((item) => ({ ...item }));
  }
}

module.exports = { CollaborationProtocol };
