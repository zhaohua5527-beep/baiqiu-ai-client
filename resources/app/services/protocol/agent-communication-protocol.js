const fs = require("node:fs");
const path = require("node:path");
const { TaskContract } = require("./task-contract");
const { ProtocolValidator } = require("./protocol-validator");
const { AgentStateSync, DEFAULT_PROTOCOL_ROOT } = require("./agent-state-sync");

class AgentCommunicationProtocol {
  constructor({ rootDir = DEFAULT_PROTOCOL_ROOT, taskContract = null, validator = null, stateSync = null } = {}) {
    this.rootDir = rootDir;
    this.contractsFile = path.join(rootDir, "task-contracts.json");
    this.taskContract = taskContract || new TaskContract();
    this.validator = validator || new ProtocolValidator();
    this.stateSync = stateSync || new AgentStateSync({ rootDir, validator: this.validator });
    this.ensureStore();
  }

  createMessage(input = {}) {
    const message = {
      ...input,
      protocolVersion: input.protocolVersion || "agent-protocol/1.0"
    };
    const validation = this.validator.validateMessage(message);
    return { message: { ...message, validation }, validation };
  }

  createContract(input = {}) {
    const contract = this.taskContract.create(input);
    const validation = this.validator.validateContract(contract);
    if (validation.valid) this.storeContract(contract);
    return { contract, validation };
  }

  contractFromAssignment(assignment = {}) {
    const contract = this.taskContract.fromAssignment(assignment);
    const validation = this.validator.validateContract(contract);
    if (validation.valid) this.storeContract(contract);
    return { contract, validation };
  }

  syncState(agent = "", patch = {}) {
    return this.stateSync.update(agent, patch);
  }

  storeContract(contract = {}) {
    const data = this.loadContracts();
    data.contracts.push(contract);
    this.writeJson(this.contractsFile, { contracts: data.contracts.slice(-500) });
  }

  loadContracts() {
    this.ensureStore();
    return this.readJson(this.contractsFile, { contracts: [] });
  }

  ensureStore() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.contractsFile)) this.writeJson(this.contractsFile, { contracts: [] });
  }

  readJson(file, fallback) {
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

module.exports = { AgentCommunicationProtocol };
