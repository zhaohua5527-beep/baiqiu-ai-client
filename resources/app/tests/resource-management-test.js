const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const { AgentQuotaManager } = require("../services/resources/agent-quota-manager");
const { TaskPriorityManager } = require("../services/resources/task-priority-manager");
const { ResourceMonitor } = require("../services/resources/resource-monitor");
const { ResourceManager } = require("../services/resources/resource-manager");
const { AgentPolicyCenter } = require("../services/governance/agent-policy-center");
const { AgentBudgetManager } = require("../services/governance/agent-budget-manager");

function root(name) {
  const dir = path.join("D:\\BaiQiuAI", "data", "resource-tests", `run-${process.pid}`, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function run() {
  const resourceRoot = root("resources");
  const governanceRoot = root("governance");

  const quotaManager = new AgentQuotaManager({ rootDir: resourceRoot });
  quotaManager.setQuota("ExecutorAgent", { maxConcurrentTasks: 1, maxToolCalls: 2 });
  const quotaOk = quotaManager.check("ExecutorAgent", { concurrentTasks: 1, toolCalls: 2 });
  assert.strictEqual(quotaOk.allowed, true, "quota within limit should pass");
  const quotaBlocked = quotaManager.check("ExecutorAgent", { concurrentTasks: 2, toolCalls: 3 });
  assert.strictEqual(quotaBlocked.allowed, false, "quota overflow should block");
  assert(quotaBlocked.violations.includes("max_concurrent_tasks"));
  assert(quotaBlocked.violations.includes("max_tool_calls"));

  const priorityManager = new TaskPriorityManager({ rootDir: resourceRoot });
  const sorted = priorityManager.sort([
    { id: "low", title: "后台任务", toolId: "file_creator" },
    { id: "urgent", title: "立即创建文件", toolId: "file_creator" },
    { id: "system", title: "关闭电脑", toolId: "system_shutdown", riskLevel: "high", needUserConfirm: true }
  ]);
  assert.strictEqual(sorted[0].id, "urgent", "urgent task should sort first");
  assert.strictEqual(sorted[1].id, "system", "high risk task should be high priority but not urgent");

  const monitor = new ResourceMonitor({ rootDir: resourceRoot, now: () => "2026-07-10T00:00:00.000Z" });
  const snapshot = monitor.snapshot({ sessionId: "resource-test" });
  assert(snapshot.memory.total > 0, "resource monitor should capture memory");
  assert.strictEqual(monitor.getLatest().timestamp, "2026-07-10T00:00:00.000Z");

  const policyCenter = new AgentPolicyCenter({ rootDir: governanceRoot });
  policyCenter.updatePolicy({ maxSteps: 2, maxToolCalls: 2, highRiskRequireConfirm: true });
  const budgetManager = new AgentBudgetManager({ rootDir: path.join(governanceRoot, "budget"), policyCenter });
  budgetManager.startSession("resource-session", "task-a");
  budgetManager.consumeStep("resource-session", "task-a");
  budgetManager.consumeStep("resource-session", "task-b");

  const resourceManager = new ResourceManager({
    rootDir: resourceRoot,
    quotaManager,
    priorityManager,
    resourceMonitor: monitor,
    policyCenter,
    budgetManager
  });
  const allocation = resourceManager.allocate({
    agent: "ExecutorAgent",
    sessionId: "resource-session",
    task: { id: "step-1", toolId: "file_creator", riskLevel: "medium" },
    usage: { concurrentTasks: 1, dailyTasks: 1, toolCalls: 1, estimatedCost: 1 }
  });
  assert.strictEqual(allocation.allowed, true, "resource allocation should pass when quota and budget allow");
  assert.strictEqual(allocation.policy.status, "allowed", "allocation should use governance policy");
  assert.strictEqual(allocation.budget.status, "running", "allocation should use budget manager");

  const highRisk = resourceManager.allocate({
    agent: "ExecutorAgent",
    sessionId: "resource-session",
    task: {
      id: "shutdown",
      toolId: "system_shutdown",
      riskLevel: "high",
      needUserConfirm: true,
      permissionScope: "system"
    },
    usage: { concurrentTasks: 1, dailyTasks: 1, toolCalls: 1, estimatedCost: 1 }
  });
  assert.strictEqual(highRisk.allowed, false, "high risk task should still require confirmation");
  assert.strictEqual(highRisk.status, "confirm_required");

  const planned = resourceManager.planResources({
    tasks: [
      { id: "normal", title: "普通创建", toolId: "file_creator" },
      { id: "urgent", title: "立即打开", toolId: "browser_open" }
    ]
  }, { agent: "ExecutorAgent", sessionId: "resource-session-2" });
  assert.strictEqual(planned.prioritized[0].id, "urgent", "planResources should prioritize tasks");
  assert.strictEqual(planned.allocations.length, 2);

  const serialized = JSON.stringify(resourceManager.loadAllocations());
  assert(!serialized.includes("ToolSelector.execute"), "resource layer must not bypass ToolSelector");
  assert(!serialized.includes("VerifierCenter.verify"), "resource layer must not bypass VerifierCenter");

  assert(fs.existsSync(path.join(resourceRoot, "quotas.json")));
  assert(fs.existsSync(path.join(resourceRoot, "priorities.json")));
  assert(fs.existsSync(path.join(resourceRoot, "resource-snapshots.json")));
  assert(fs.existsSync(path.join(resourceRoot, "allocations.json")));

  return {
    ok: true,
    cases: [
      "quota_manager_blocks_overuse",
      "task_priority_sorting",
      "resource_monitor_snapshot",
      "resource_manager_uses_governance_budget",
      "high_risk_not_auto_allowed"
    ]
  };
}

if (require.main === module) console.log(JSON.stringify(run(), null, 2));

module.exports = { run };
