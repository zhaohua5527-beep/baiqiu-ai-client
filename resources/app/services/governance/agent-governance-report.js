const fs = require("node:fs");
const path = require("node:path");
const { DEFAULT_GOVERNANCE_ROOT } = require("./agent-policy-center");

class AgentGovernanceReport {
  constructor({ rootDir = path.join(DEFAULT_GOVERNANCE_ROOT, "reports"), healthMonitor = null, budgetRoot = null } = {}) {
    this.rootDir = rootDir;
    this.healthMonitor = healthMonitor;
    this.budgetRoot = budgetRoot || path.join(DEFAULT_GOVERNANCE_ROOT, "budget");
    fs.mkdirSync(rootDir, { recursive: true });
  }

  generate({ tasks = [], recoveryCount = 0 } = {}) {
    const totalTasks = tasks.length;
    const success = tasks.filter((item) => item.success === true || item.status === "success").length;
    const failed = tasks.filter((item) => item.success === false || item.status === "failed").length;
    const avgDuration = this.average(tasks.map((item) => item.duration || item.durationMs || 0));
    const budgets = this.loadBudgets();
    const budgetBlockedCount = budgets.filter((item) => item.status === "budget_exceeded").length;
    const policyBlockedCount = tasks.filter((item) => item.status === "policy_block" || item.status === "confirm_required").length;
    const report = {
      generatedAt: new Date().toISOString(),
      totalTasks,
      successRate: totalTasks ? success / totalTasks : 0,
      failureRate: totalTasks ? failed / totalTasks : 0,
      avgDuration,
      recoveryCount,
      budgetBlockedCount,
      policyBlockedCount,
      health: this.healthMonitor?.getHealth?.() || {}
    };
    const file = path.join(this.rootDir, "daily-report.json");
    fs.mkdirSync(this.rootDir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(report, null, 2), "utf8");
    return { file, report };
  }

  loadBudgets() {
    try {
      return fs.readdirSync(this.budgetRoot)
        .filter((name) => name.endsWith(".json"))
        .map((name) => JSON.parse(fs.readFileSync(path.join(this.budgetRoot, name), "utf8")));
    } catch {
      return [];
    }
  }

  average(values = []) {
    const nums = values.map((value) => Number(value) || 0);
    if (!nums.length) return 0;
    return nums.reduce((sum, value) => sum + value, 0) / nums.length;
  }
}

module.exports = { AgentGovernanceReport };
