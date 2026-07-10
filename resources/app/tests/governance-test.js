const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const { AgentPolicyCenter } = require("../services/governance/agent-policy-center");
const { AgentBudgetManager } = require("../services/governance/agent-budget-manager");
const { AgentHealthMonitor } = require("../services/governance/agent-health-monitor");
const { AgentGovernanceReport } = require("../services/governance/agent-governance-report");
const { SupervisorAgent } = require("../services/agents/supervisor-agent");

function root(name) {
  const dir = path.join("D:\\BaiQiuAI", "data", "governance-tests", `run-${process.pid}`, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function run() {
  const normalRoot = root("normal");
  const policyCenter = new AgentPolicyCenter({ rootDir: normalRoot });
  const normal = policyCenter.checkTask({ intent: "dev.code.calculator", riskLevel: "medium" }, { stepCount: 2 });
  assert.strictEqual(normal.allowed, true, "normal calculator task should pass policy");

  const tooManySteps = policyCenter.checkTask({ intent: "file.create" }, { stepCount: 51 });
  assert.strictEqual(tooManySteps.status, "policy_block", "over 50 steps should be policy_block");

  const highRisk = policyCenter.checkTask({ intent: "system.shutdown", riskLevel: "high" }, { stepCount: 1 });
  assert.strictEqual(highRisk.status, "confirm_required", "high risk task should require confirmation");

  const budgetRoot = root("budget");
  const tightPolicy = new AgentPolicyCenter({ rootDir: budgetRoot });
  tightPolicy.updatePolicy({ maxRetry: 1, maxToolCalls: 2, maxSteps: 50 });
  const budget = new AgentBudgetManager({ rootDir: path.join(budgetRoot, "budget"), policyCenter: tightPolicy });
  budget.startSession("retry-session", "task-1");
  assert.strictEqual(budget.consumeRetry("retry-session", "task-1").allowed, true);
  const retryBlocked = budget.consumeRetry("retry-session", "task-1");
  assert.strictEqual(retryBlocked.status, "budget_exceeded", "retry over budget should stop task");

  const healthRoot = root("health");
  const health = new AgentHealthMonitor({ rootDir: healthRoot });
  health.recordSuccess("ExecutorAgent", 10);
  health.recordFailure("ExecutorAgent", 20);
  health.recordSuccess("VerifierAgent", 5);
  assert.strictEqual(health.getHealth("ExecutorAgent").successCount, 1);
  assert.strictEqual(health.getHealth("ExecutorAgent").failCount, 1);
  assert.strictEqual(health.getHealth("VerifierAgent").successCount, 1);

  const supervisor = new SupervisorAgent({
    policyCenter,
    healthMonitor: health,
    intentAgent: { analyze: (text) => ({ text, primaryIntent: "dev.code.calculator", intents: [{ intent: "dev.code.calculator", clause: text }] }) }
  });
  const supervised = supervisor.analyze({ userMessage: "帮我写一个计算器软件" });
  assert.strictEqual(supervised.policy.allowed, true);

  const reportRoot = root("report");
  const reporter = new AgentGovernanceReport({
    rootDir: path.join(reportRoot, "reports"),
    healthMonitor: health,
    budgetRoot: path.join(budgetRoot, "budget")
  });
  const generated = reporter.generate({
    tasks: [
      { status: "success", duration: 10 },
      { status: "failed", duration: 20 },
      { status: "policy_block", duration: 0 }
    ],
    recoveryCount: 1
  });
  assert(fs.existsSync(generated.file), "daily governance report should exist");
  assert.strictEqual(generated.report.totalTasks, 3);
  assert.strictEqual(generated.report.recoveryCount, 1);
  assert(generated.report.budgetBlockedCount >= 1, "budget blocked count should be included");
  assert.strictEqual(generated.report.policyBlockedCount, 1);

  return {
    ok: true,
    cases: [
      "normal_calculator_policy_pass",
      "over_50_steps_policy_block",
      "infinite_retry_budget_exceeded",
      "high_risk_confirm_required",
      "health_counts",
      "governance_report"
    ]
  };
}

if (require.main === module) {
  console.log(JSON.stringify(run(), null, 2));
}

module.exports = { run };
