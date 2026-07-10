const fs = require("node:fs");
const path = require("node:path");
const { AgentQuotaManager, DEFAULT_RESOURCE_ROOT } = require("./agent-quota-manager");
const { TaskPriorityManager } = require("./task-priority-manager");
const { ResourceMonitor } = require("./resource-monitor");
const { AgentPolicyCenter } = require("../governance/agent-policy-center");
const { AgentBudgetManager } = require("../governance/agent-budget-manager");

class ResourceManager {
  constructor({
    rootDir = DEFAULT_RESOURCE_ROOT,
    quotaManager = null,
    priorityManager = null,
    resourceMonitor = null,
    policyCenter = null,
    budgetManager = null
  } = {}) {
    this.rootDir = rootDir;
    this.allocationsFile = path.join(rootDir, "allocations.json");
    this.quotaManager = quotaManager || new AgentQuotaManager({ rootDir });
    this.priorityManager = priorityManager || new TaskPriorityManager({ rootDir });
    this.resourceMonitor = resourceMonitor || new ResourceMonitor({ rootDir });
    this.policyCenter = policyCenter || new AgentPolicyCenter();
    this.budgetManager = budgetManager || new AgentBudgetManager({ policyCenter: this.policyCenter });
    this.ensureStore();
  }

  allocate({ agent = "ExecutorAgent", sessionId = "", task = {}, usage = {} } = {}) {
    const quota = this.quotaManager.check(agent, usage);
    const priority = this.priorityManager.classify(task);
    const policy = this.policyCenter.checkTask(task, { stepCount: usage.stepCount || 1, toolCalls: usage.toolCalls || 0 });
    const budget = sessionId ? this.budgetManager.checkBudget(sessionId) : { allowed: true, status: "running", reason: "" };
    const allowed = quota.allowed && policy.allowed !== false && budget.allowed !== false;
    const allocation = {
      agent,
      sessionId,
      taskId: task.id || task.taskId || "",
      toolId: task.toolId || "",
      allowed,
      status: allowed ? "allocated" : (quota.status !== "allowed" ? quota.status : policy.status !== "allowed" ? policy.status : budget.status),
      quota,
      priority,
      policy,
      budget,
      timestamp: new Date().toISOString()
    };
    this.appendAllocation(allocation);
    return allocation;
  }

  planResources(planObject = {}, { agent = "ExecutorAgent", sessionId = "" } = {}) {
    const tasks = Array.isArray(planObject.tasks) ? planObject.tasks : Array.isArray(planObject.steps) ? planObject.steps : [];
    const prioritized = this.priorityManager.sort(tasks);
    const allocations = prioritized.map((task, index) => this.allocate({
      agent,
      sessionId,
      task,
      usage: {
        stepCount: index + 1,
        toolCalls: index,
        dailyTasks: index + 1,
        concurrentTasks: 1,
        estimatedCost: index + 1
      }
    }));
    const snapshot = this.resourceMonitor.snapshot({
      sessionId,
      taskCount: tasks.length
    });
    return {
      success: allocations.every((item) => item.allowed),
      prioritized,
      allocations,
      snapshot
    };
  }

  checkBudget(sessionId = "") {
    return this.budgetManager.checkBudget(sessionId);
  }

  appendAllocation(allocation = {}) {
    const data = this.loadAllocations();
    data.allocations.push(allocation);
    this.writeJson(this.allocationsFile, { allocations: data.allocations.slice(-500) });
  }

  loadAllocations() {
    return this.readJson(this.allocationsFile, { allocations: [] });
  }

  ensureStore() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.allocationsFile)) this.writeJson(this.allocationsFile, { allocations: [] });
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

module.exports = { ResourceManager };
