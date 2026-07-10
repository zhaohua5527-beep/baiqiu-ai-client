class ProtocolValidator {
  validateMessage(message = {}) {
    const errors = [];
    if (!message.from) errors.push("missing_from");
    if (!message.to) errors.push("missing_to");
    if (!message.type) errors.push("missing_type");
    if (!message.protocolVersion) errors.push("missing_protocol_version");
    if (message.type === "assignment") {
      const assignments = message.payload?.assignments;
      if (!Array.isArray(assignments)) errors.push("missing_assignments");
    }
    return {
      valid: errors.length === 0,
      errors
    };
  }

  validateContract(contract = {}) {
    const errors = [];
    if (!contract.contractId) errors.push("missing_contract_id");
    if (!contract.protocolVersion) errors.push("missing_protocol_version");
    if (!contract.taskId) errors.push("missing_task_id");
    if (!contract.agent) errors.push("missing_agent");
    if (contract.role === "execute" && !contract.toolId) errors.push("missing_tool_id");
    if (!Array.isArray(contract.dependsOn)) errors.push("invalid_depends_on");
    if (contract.needUserConfirm === false && String(contract.riskLevel || "").toLowerCase() === "high") errors.push("high_risk_requires_confirm");
    return {
      valid: errors.length === 0,
      errors
    };
  }

  validateState(state = {}) {
    const errors = [];
    if (!state.agent) errors.push("missing_agent");
    if (!state.status) errors.push("missing_status");
    if (!state.updatedAt) errors.push("missing_updated_at");
    return {
      valid: errors.length === 0,
      errors
    };
  }
}

module.exports = { ProtocolValidator };
