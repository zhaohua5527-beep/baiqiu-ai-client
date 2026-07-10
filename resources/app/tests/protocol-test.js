const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const { TaskContract } = require("../services/protocol/task-contract");
const { ProtocolValidator } = require("../services/protocol/protocol-validator");
const { AgentStateSync } = require("../services/protocol/agent-state-sync");
const { AgentCommunicationProtocol } = require("../services/protocol/agent-communication-protocol");
const { AgentMessageBus } = require("../services/collaboration/agent-message-bus");
const { AgentCoordinator } = require("../services/collaboration/agent-coordinator");

function root(name) {
  const dir = path.join("D:\\BaiQiuAI", "data", "protocol-tests", `run-${process.pid}`, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function run() {
  const dir = root("protocol");
  const validator = new ProtocolValidator();
  const taskContract = new TaskContract();
  const contract = taskContract.create({
    task: {
      id: "step-1",
      toolId: "calculator_creator",
      action: "create",
      target: "calculator",
      verifier: "calculator_creator",
      dependsOn: []
    },
    agent: "ExecutorAgent"
  });
  assert.strictEqual(validator.validateContract(contract).valid, true, "valid task contract should pass");

  const unsafe = taskContract.create({
    task: {
      id: "shutdown",
      toolId: "system_shutdown",
      action: "shutdown",
      target: "computer",
      riskLevel: "high",
      needUserConfirm: false
    },
    agent: "ExecutorAgent"
  });
  assert(validator.validateContract(unsafe).errors.includes("high_risk_requires_confirm"), "high risk contract should require confirm");

  const protocol = new AgentCommunicationProtocol({ rootDir: dir, validator });
  const wrapped = protocol.createMessage({
    id: "msg-1",
    from: "AgentCoordinator",
    to: "ExecutorAgent",
    type: "assignment",
    payload: { assignments: [{ taskId: "step-1" }] },
    status: "published"
  });
  assert.strictEqual(wrapped.validation.valid, true, "protocol message should validate");
  assert.strictEqual(wrapped.message.protocolVersion, "agent-protocol/1.0");

  const badMessage = protocol.createMessage({
    id: "msg-2",
    from: "",
    to: "ExecutorAgent",
    type: "assignment",
    payload: {}
  });
  assert.strictEqual(badMessage.validation.valid, false, "invalid message should fail validation");

  const stateSync = new AgentStateSync({ rootDir: dir, validator });
  const state = stateSync.update("ExecutorAgent", {
    status: "running",
    currentTask: "step-1",
    currentStage: "execute",
    traceId: "trace-protocol"
  });
  assert.strictEqual(state.success, true, "agent state sync should persist valid state");
  assert.strictEqual(stateSync.get("ExecutorAgent").status, "running");

  const bus = new AgentMessageBus({ rootDir: dir, protocol });
  const msg = bus.publish({
    from: "AgentCoordinator",
    to: "ExecutorAgent",
    type: "assignment",
    payload: { assignments: [{ taskId: "step-1" }] },
    sessionId: "protocol-test",
    traceId: "trace-1"
  });
  assert.strictEqual(msg.validation.valid, true, "message bus should attach protocol validation");

  const coordinator = new AgentCoordinator({ messageBus: bus, protocol });
  const coordinated = coordinator.coordinate({
    planObject: {
      goal: "calculator",
      steps: [{ id: "step-1", toolId: "calculator_creator", action: "create", target: "calculator", dependsOn: [] }]
    },
    sessionId: "protocol-test",
    traceId: "trace-2"
  });
  assert.strictEqual(coordinated.contracts.length, 1, "coordinator should create task contracts");
  assert.strictEqual(coordinated.contracts[0].validation.valid, true);
  assert.strictEqual(protocol.stateSync.get("ExecutorAgent").currentTask, "step-1");

  const serialized = JSON.stringify({ messages: bus.load(), contracts: protocol.loadContracts() });
  assert(!serialized.includes("ToolSelector.execute"), "protocol layer must not bypass ToolSelector");
  assert(!serialized.includes("VerifierCenter.verify"), "protocol layer must not bypass VerifierCenter");

  assert(fs.existsSync(path.join(dir, "task-contracts.json")));
  assert(fs.existsSync(path.join(dir, "agent-state.json")));
  assert(fs.existsSync(path.join(dir, "messages.json")));

  return {
    ok: true,
    cases: [
      "task_contract_validated",
      "high_risk_contract_rejected_without_confirm",
      "protocol_message_validated",
      "agent_state_sync",
      "coordinator_creates_contracts"
    ]
  };
}

if (require.main === module) console.log(JSON.stringify(run(), null, 2));

module.exports = { run };
