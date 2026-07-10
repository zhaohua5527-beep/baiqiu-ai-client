const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const { TaskRouter } = require("../services/distributed/task-router");
const { ExecutionNode } = require("../services/distributed/execution-node");
const { NodeManager } = require("../services/distributed/node-manager");
const { DistributedScheduler } = require("../services/distributed/distributed-scheduler");

function root(name) {
  const dir = path.join("D:\\BaiQiuAI", "data", "distributed-tests", `run-${process.pid}`, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function samplePlan() {
  return {
    goal: "calculator",
    steps: [
      { id: "step-1", toolId: "calculator_creator", action: "create", target: "calculator", dependsOn: [] },
      { id: "step-2", toolId: "browser_open", action: "open", target: "calculator", dependsOn: ["step-1"] }
    ]
  };
}

async function run() {
  const dir = root("distributed");
  const router = new TaskRouter();
  const route = router.route({ step: { toolId: "calculator_creator" }, contract: { toolId: "calculator_creator" } }, [
    { nodeId: "browser-node", capabilities: ["browser_open"], status: "idle", load: 0 },
    { nodeId: "calculator-node", capabilities: ["calculator_creator"], status: "idle", load: 1 }
  ]);
  assert.strictEqual(route.routed, true);
  assert.strictEqual(route.nodeId, "calculator-node", "router should pick capability match");

  const noRoute = router.route({ contract: { toolId: "file_creator" } }, [
    { nodeId: "offline", capabilities: ["*"], status: "offline", load: 0 }
  ]);
  assert.strictEqual(noRoute.routed, false, "offline nodes should not receive tasks");

  const node = new ExecutionNode({ nodeId: "test-node", capabilities: ["calculator_creator"] });
  const nodeResult = await node.execute({ id: "assign-1", taskId: "step-1", step: { toolId: "calculator_creator" } });
  assert.strictEqual(nodeResult.success, true);
  assert.strictEqual(nodeResult.status, "scheduled", "default node should schedule for existing executor chain");

  const manager = new NodeManager({
    rootDir: dir,
    nodes: [
      new ExecutionNode({ nodeId: "calculator-node", capabilities: ["calculator_creator"] }),
      new ExecutionNode({ nodeId: "browser-node", capabilities: ["browser_open"] })
    ]
  });
  assert.strictEqual(manager.listNodes().length, 2);
  assert.strictEqual(manager.setStatus("browser-node", "idle").status, "idle");

  const scheduler = new DistributedScheduler({ rootDir: dir, nodeManager: manager, taskRouter: router });
  const schedule = scheduler.schedule(samplePlan(), { sessionId: "dist-test", traceId: "trace-dist" });
  assert.strictEqual(schedule.success, true);
  assert.deepStrictEqual(schedule.routes.map((item) => item.nodeId), ["calculator-node", "browser-node"]);
  assert(schedule.routes.every((item) => item.contract.protocolVersion === "agent-protocol/1.0"));

  const dispatch = await scheduler.dispatch(samplePlan(), { sessionId: "dist-test", traceId: "trace-dist" });
  assert.strictEqual(dispatch.summary.success, true);
  assert.strictEqual(dispatch.summary.total, 2);
  assert.strictEqual(dispatch.results.length, 2);

  const failedSummary = scheduler.aggregate([
    { taskId: "a", success: true },
    { taskId: "b", success: false, status: "failed" }
  ]);
  assert.strictEqual(failedSummary.success, false);
  assert.strictEqual(failedSummary.failedCount, 1);

  const serialized = JSON.stringify({ schedule, dispatch });
  assert(!serialized.includes("ToolSelector.execute"), "distributed layer must not bypass ToolSelector");
  assert(!serialized.includes("VerifierCenter.verify"), "distributed layer must not bypass VerifierCenter");

  assert(fs.existsSync(path.join(dir, "nodes.json")));
  assert(fs.existsSync(path.join(dir, "routes.json")));
  assert(fs.existsSync(path.join(dir, "distributed-results.json")));

  return {
    ok: true,
    cases: [
      "task_router_capability_match",
      "execution_node_schedules_existing_chain",
      "node_manager_registers_nodes",
      "distributed_scheduler_routes_tasks",
      "distributed_results_aggregated"
    ]
  };
}

if (require.main === module) run().then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => {
  console.error(error);
  process.exit(1);
});

module.exports = { run };
