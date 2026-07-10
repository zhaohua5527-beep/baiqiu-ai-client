const fs = require("node:fs");
const path = require("node:path");
const { AgentPolicyCenter } = require("../governance/agent-policy-center");
const { DEFAULT_AUTONOMY_ROOT } = require("./autonomy-level-manager");

function nowIso() {
  return new Date().toISOString();
}

class DecisionBoundaryManager {
  constructor({ rootDir = DEFAULT_AUTONOMY_ROOT, policyCenter = null } = {}) {
    this.rootDir = rootDir;
    this.boundariesFile = path.join(rootDir, "decision-boundaries.json");
    this.policyCenter = policyCenter || new AgentPolicyCenter();
    this.ensureStore();
  }

  evaluate({ task = {}, autonomyLevel = {}, context = {} } = {}) {
    const policyCheck = this.policyCenter.checkTask(task, context);
    const risk = task.riskLevel || (task.needUserConfirm ? "high" : "low");
    const requireConfirmRisk = Array.isArray(autonomyLevel.requireConfirmRisk) ? autonomyLevel.requireConfirmRisk : ["high"];
    const requiresHuman = policyCheck.allowed === false || requireConfirmRisk.includes(risk) || task.needUserConfirm === true;
    const boundary = {
      taskId: task.id || task.taskId || "",
      toolId: task.toolId || "",
      riskLevel: risk,
      autonomyLevel: autonomyLevel.level || "assisted",
      allowedToRecommend: true,
      allowedToExecute: false,
      requiresHuman,
      status: requiresHuman ? (policyCheck.status === "allowed" ? "confirm_required" : policyCheck.status) : "recommendation_allowed",
      reason: policyCheck.reason || (requiresHuman ? "human confirmation required by autonomy boundary" : ""),
      policy: policyCheck.policy || this.policyCenter.getPolicy(),
      safety: {
        advisoryOnly: true,
        modifiesPermission: false,
        bypassesToolSelector: false,
        bypassesVerifierCenter: false
      },
      timestamp: nowIso()
    };
    this.append(boundary);
    return boundary;
  }

  append(item = {}) {
    const data = this.load();
    data.boundaries.push(item);
    this.writeJson(this.boundariesFile, { boundaries: data.boundaries.slice(-500) });
  }

  load() {
    return this.readJson(this.boundariesFile, { boundaries: [] });
  }

  ensureStore() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.boundariesFile)) this.writeJson(this.boundariesFile, { boundaries: [] });
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

module.exports = { DecisionBoundaryManager };
