const assert = require("node:assert");
const { AgentEventBus, AGENT_EVENTS } = require("../services/neural-core/agent-event-bus");
const { AgentStateManager, AGENT_STATES } = require("../services/agent_state_manager");
const { NeuralGovernance } = require("../services/neural-core/governance");

function run() {
  const bus = new AgentEventBus({ governance: new NeuralGovernance({ maxLoops: 20 }) });
  const stateManager = new AgentStateManager();
  stateManager.attachEventBus(bus);
  const sessionId = `neural-event-${process.pid}`;
  const traceId = `trace-${process.pid}`;

  bus.publish(AGENT_EVENTS.INTENT_DETECTED, { sessionId, traceId, intent: "dev.code.calculator", goal: "create calculator" });
  bus.publish(AGENT_EVENTS.PLAN_CREATED, { sessionId, traceId, plan: { id: "plan-1", tasks: [{ id: "step1", toolId: "calculator_creator" }] } });
  bus.publish(AGENT_EVENTS.TOOL_SELECTED, { sessionId, traceId, toolId: "calculator_creator", logicalTool: "html_app_creator" });
  bus.publish(AGENT_EVENTS.TOOL_EXECUTING, { sessionId, traceId, toolId: "calculator_creator" });
  bus.publish(AGENT_EVENTS.TOOL_RESULT, { sessionId, traceId, toolId: "calculator_creator", success: true, result: { file: "D:\\BaiQiuAI\\data\\apps\\x.html" } });
  bus.publish(AGENT_EVENTS.VERIFICATION_DONE, { sessionId, traceId, status: "passed", verification: { status: "passed" } });
  bus.publish(AGENT_EVENTS.MEMORY_UPDATED, { sessionId, traceId, type: "experience", value: "calculator success" });
  bus.publish(AGENT_EVENTS.TASK_COMPLETED, { sessionId, traceId });

  const snapshot = stateManager.snapshot(sessionId);
  assert.strictEqual(snapshot.state, AGENT_STATES.COMPLETED, "StateManager should consume events and reach COMPLETED");
  assert.strictEqual(snapshot.taskContext.userIntent, "dev.code.calculator", "taskContext should capture intent");
  assert(snapshot.taskContext.plan, "taskContext should capture plan");
  assert(snapshot.taskContext.tools.some((tool) => tool.toolId === "calculator_creator"), "taskContext should capture selected tool");
  assert(snapshot.taskContext.executionHistory.some((item) => item.toolId === "calculator_creator"), "taskContext should capture execution history");
  assert(snapshot.taskContext.memoryUpdates.length === 1, "taskContext should capture memory update");

  const trace = bus.getTrace(traceId);
  assert.strictEqual(trace.userIntent, "dev.code.calculator", "AgentTrace should record user intent");
  assert(trace.plan, "AgentTrace should record plan");
  assert(trace.toolSelections.length >= 1, "AgentTrace should record tool selection");
  assert(trace.executions.length >= 1, "AgentTrace should record execution result");
  assert(trace.verifications.length >= 1, "AgentTrace should record verification");

  const risky = bus.publish(AGENT_EVENTS.TOOL_EXECUTING, {
    sessionId,
    traceId,
    toolId: "system_shutdown",
    riskLevel: "high",
    needUserConfirm: true
  });
  assert.strictEqual(risky.blocked, true, "Governance should block high risk tool without confirmation");
  assert.strictEqual(risky.governance.status, "confirm_required", "Governance should report confirm_required");

  const loopBus = new AgentEventBus({ governance: new NeuralGovernance({ maxLoops: 2 }) });
  loopBus.publish(AGENT_EVENTS.INTENT_DETECTED, { sessionId: "loop" });
  loopBus.publish(AGENT_EVENTS.INTENT_DETECTED, { sessionId: "loop" });
  const blocked = loopBus.publish(AGENT_EVENTS.INTENT_DETECTED, { sessionId: "loop" });
  assert.strictEqual(blocked.blocked, true, "Governance should stop abnormal loops");

  return {
    ok: true,
    cases: [
      "event_bus_created",
      "state_manager_consumes_events",
      "agent_trace_records_lifecycle",
      "governance_high_risk_confirm",
      "governance_loop_stop"
    ]
  };
}

if (require.main === module) console.log(JSON.stringify(run(), null, 2));

module.exports = { run };
