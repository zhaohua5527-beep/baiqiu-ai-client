const fs = require("node:fs");
const path = require("node:path");
const { TaskRouter } = require("./task-router");
const { NodeManager, DEFAULT_DISTRIBUTED_ROOT } = require("./node-manager");
const { TaskContract } = require("../protocol/task-contract");

class DistributedScheduler {
  constructor({ rootDir = DEFAULT_DISTRIBUTED_ROOT, taskRouter = null, nodeManager = null, taskContract = null } = {}) {
    this.rootDir = rootDir;
    this.routesFile = path.join(rootDir, "routes.json");
    this.resultsFile = path.join(rootDir, "distributed-results.json");
    this.taskRouter = taskRouter || new TaskRouter();
    this.nodeManager = nodeManager || new NodeManager({ rootDir });
    this.taskContract = taskContract || new TaskContract();
    this.ensureStore();
  }

  schedule(planObject = {}, context = {}) {
    const steps = Array.isArray(planObject.steps) ? planObject.steps : Array.isArray(planObject.tasks) ? planObject.tasks : [];
    const nodes = this.nodeManager.listNodes();
    const routes = steps.map((step, index) => {
      const assignment = {
        id: `dist-${index + 1}`,
        taskId: step.id || step.taskId || `step-${index + 1}`,
        step,
        contract: this.taskContract.create({ task: step, agent: "ExecutorAgent", role: "execute" })
      };
      const route = this.taskRouter.route(assignment, nodes);
      return {
        ...assignment,
        nodeId: route.nodeId,
        routed: route.routed,
        routeReason: route.reason,
        sessionId: context.sessionId || "",
        traceId: context.traceId || ""
      };
    });
    this.appendJson(this.routesFile, "routes", routes);
    return {
      success: routes.every((item) => item.routed),
      routes,
      nodeCount: nodes.length
    };
  }

  async dispatch(planObject = {}, context = {}) {
    const schedule = this.schedule(planObject, context);
    const results = [];
    for (const route of schedule.routes) {
      if (!route.routed) {
        results.push({
          nodeId: "",
          taskId: route.taskId,
          success: false,
          status: "failed",
          error: route.routeReason
        });
        continue;
      }
      results.push(await this.nodeManager.executeOnNode(route.nodeId, route, context));
    }
    const summary = this.aggregate(results);
    this.appendJson(this.resultsFile, "results", [{ ...summary, results, timestamp: new Date().toISOString() }]);
    return {
      schedule,
      results,
      summary
    };
  }

  aggregate(results = []) {
    const list = Array.isArray(results) ? results : [];
    const successCount = list.filter((item) => item.success === true || item.status === "success" || item.status === "scheduled").length;
    const failedCount = list.filter((item) => item.success === false || item.status === "failed").length;
    return {
      success: failedCount === 0,
      total: list.length,
      successCount,
      failedCount
    };
  }

  ensureStore() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.routesFile)) this.writeJson(this.routesFile, { routes: [] });
    if (!fs.existsSync(this.resultsFile)) this.writeJson(this.resultsFile, { results: [] });
  }

  appendJson(file, key, items = []) {
    const data = this.readJson(file, { [key]: [] });
    const current = Array.isArray(data[key]) ? data[key] : [];
    const next = Array.isArray(items) ? items : [items];
    this.writeJson(file, { [key]: current.concat(next).slice(-500) });
  }

  readJson(file, fallback) {
    this.ensureStore();
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

module.exports = { DistributedScheduler };
