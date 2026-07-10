const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { AgentEventBus, AGENT_EVENTS, ERROR_CODES, writeDiagnostics } = require("../services/neural-core/agent-event-bus");
const { TaskQueue } = require("../services/task-queue");
const { ToolExecutionService } = require("../services/tool-execution-service");
const { AgentManager } = require("../services/neural-core/agent-manager");
const { ExperienceStore } = require("../services/neural-core/experience-store");
const { MemoryCenter } = require("../services/memory-center");
const { ContextManager } = require("../services/context-manager");

function tempDir(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `baiqiu-${name}-`));
}

function allowAllGovernance() {
  return { check: () => ({ allowed: true, status: "allowed", reason: "" }) };
}

async function main() {
  const cases = [];

  {
    const bus = new AgentEventBus({ reflectionEngine: null, governance: allowAllGovernance() });
    let consumed = 0;
    bus.subscribe(AGENT_EVENTS.TOOL_RESULT, () => { consumed += 1; });
    const payload = { sessionId: "hardening", traceId: "trace-1", taskId: "task-1", toolId: "file_creator", status: "success" };
    const first = bus.publish(AGENT_EVENTS.TOOL_RESULT, payload);
    const second = bus.publish(AGENT_EVENTS.TOOL_RESULT, payload);
    assert.equal(first.duplicate, undefined);
    assert.equal(second.duplicate, true);
    assert.equal(consumed, 1);
    cases.push("event_duplicate_consumed_once");
  }

  {
    let db = { queue: [] };
    const queue = new TaskQueue({
      loadDb: () => db,
      saveDb: (next) => { db = next; },
      eventBus: new AgentEventBus({ reflectionEngine: null })
    });
    const first = queue.enqueue("session-1", { id: "same-task", title: "A" });
    const second = queue.enqueue("session-1", { id: "same-task", title: "B" });
    assert.equal(first.id, second.id);
    assert.equal(db.queue.length, 1);
    cases.push("task_queue_idempotent_enqueue");
  }

  {
    const service = new ToolExecutionService({
      registry: {
        list: () => [{ id: "broken_tool" }],
        execute: () => { throw new Error("boom"); }
      },
      selector: {
        approveToolCall: () => ({ approved: true, reason: "test", selectedTools: [{ id: "broken_tool" }] })
      }
    });
    const result = await service.execute({ toolId: "broken_tool", args: {}, context: {} });
    assert.equal(result.success, false);
    assert.match(String(result.error), /NC3001/);
    cases.push("tool_failure_standardized");
  }

  {
    const manager = new AgentManager({ eventBus: new AgentEventBus({ reflectionEngine: null }) });
    const result = await manager.dispatchTask({
      taskOrchestrator: { execute: async () => { throw new Error("orchestrator down"); } },
      sessionId: "session-1",
      message: "test",
      planObject: { primaryIntent: "test.intent", goal: "test" }
    });
    assert.equal(result.success, false);
    assert.match(String(result.error), /NC9001/);
    cases.push("agent_manager_dispatch_recovers");
  }

  {
    const root = tempDir("memory-repair");
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, "user.json"), "{bad json", "utf8");
    const memory = new MemoryCenter({ root, eventBus: new AgentEventBus({ reflectionEngine: null }) });
    assert.ok(memory.getUser());
    assert.ok(JSON.parse(fs.readFileSync(path.join(root, "user.json"), "utf8")));
    assert.ok(fs.readdirSync(root).some((name) => name.includes("user.json.corrupt-")));
    cases.push("memory_corrupt_json_repaired");
  }

  {
    const root = tempDir("context-repair");
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, "active.json"), "{bad json", "utf8");
    const context = new ContextManager({ root });
    assert.ok(context.getActiveContext("session-1"));
    assert.ok(JSON.parse(fs.readFileSync(path.join(root, "active.json"), "utf8")));
    assert.ok(fs.readdirSync(root).some((name) => name.includes("active.json.corrupt-")));
    cases.push("context_corrupt_json_repaired");
  }

  {
    const filePath = path.join(tempDir("experience-repair"), "experience.json");
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, "{bad json", "utf8");
    const store = new ExperienceStore({ filePath });
    assert.deepEqual(store.load(), { items: [] });
    assert.ok(fs.existsSync(filePath));
    cases.push("experience_corrupt_json_repaired");
  }

  {
    const bus = new AgentEventBus({ reflectionEngine: null, governance: allowAllGovernance() });
    const publishMany = async (count) => Promise.all(Array.from({ length: count }, (_, index) => Promise.resolve().then(() => {
      bus.publish(AGENT_EVENTS.TOOL_RESULT, {
        sessionId: `concurrency-${count}`,
        traceId: `trace-${count}`,
        taskId: `task-${index}`,
        toolId: "noop",
        status: "success"
      });
    })));
    for (const count of [5, 10, 20, 50]) await publishMany(count);
    cases.push("concurrency_5_10_20_50_eventbus_safe");
  }

  {
    const bus = new AgentEventBus({ reflectionEngine: null, governance: allowAllGovernance() });
    for (let index = 0; index < 1000; index += 1) {
      bus.publish(AGENT_EVENTS.TOOL_RESULT, {
        sessionId: "stress",
        traceId: "stress-trace",
        taskId: `stress-${index}`,
        toolId: "noop",
        status: "success"
      });
    }
    cases.push("stress_1000_eventbus_safe");
  }

  const diagnostics = writeDiagnostics({ phase: "6.3", cases });
  assert.ok(diagnostics.runtime);
  assert.ok(ERROR_CODES.STRATEGY_FAILURE && ERROR_CODES.UNKNOWN_RUNTIME_FAILURE);
  cases.push("diagnostics_generated");

  console.log(JSON.stringify({ ok: true, cases }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
