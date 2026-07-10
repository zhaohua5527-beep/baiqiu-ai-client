const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_GOVERNANCE_ROOT = path.join("D:\\BaiQiuAI", "data", "governance");
const DEFAULT_POLICY = Object.freeze({
  maxSteps: 50,
  maxToolCalls: 100,
  maxRetry: 3,
  maxExecutionTime: 600000,
  highRiskRequireConfirm: true
});

class AgentPolicyCenter {
  constructor({ rootDir = DEFAULT_GOVERNANCE_ROOT, policyFile = null } = {}) {
    this.rootDir = rootDir;
    this.policyFile = policyFile || path.join(rootDir, "policy.json");
    this.ensurePolicy();
  }

  ensurePolicy() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.policyFile)) this.writePolicy(DEFAULT_POLICY);
  }

  getPolicy() {
    this.ensurePolicy();
    try {
      return { ...DEFAULT_POLICY, ...JSON.parse(fs.readFileSync(this.policyFile, "utf8")) };
    } catch {
      return { ...DEFAULT_POLICY };
    }
  }

  updatePolicy(patch = {}) {
    const policy = { ...this.getPolicy(), ...patch };
    this.writePolicy(policy);
    return policy;
  }

  checkTask(task = {}, context = {}) {
    const policy = this.getPolicy();
    const steps = Array.isArray(context.planTasks) ? context.planTasks.length : Number(context.stepCount || 1);
    if (steps > Number(policy.maxSteps || DEFAULT_POLICY.maxSteps)) {
      return { allowed: false, status: "policy_block", reason: "max steps exceeded", policy };
    }
    if (Number(context.toolCalls || 0) > Number(policy.maxToolCalls || DEFAULT_POLICY.maxToolCalls)) {
      return { allowed: false, status: "budget_exceeded", reason: "max tool calls exceeded", policy };
    }
    const highRisk = task.riskLevel === "high" || task.needUserConfirm === true || task.requiresPermission === true && task.permissionScope === "system";
    if (highRisk && policy.highRiskRequireConfirm) {
      return { allowed: false, status: "confirm_required", reason: "high risk task requires confirmation", policy };
    }
    return { allowed: true, status: "allowed", reason: "", policy };
  }

  writePolicy(policy) {
    fs.mkdirSync(path.dirname(this.policyFile), { recursive: true });
    fs.writeFileSync(this.policyFile, JSON.stringify(policy, null, 2), "utf8");
  }
}

module.exports = { AgentPolicyCenter, DEFAULT_POLICY, DEFAULT_GOVERNANCE_ROOT };
