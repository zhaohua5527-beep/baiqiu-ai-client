const fs = require("node:fs");
const path = require("node:path");
const { AgentPolicyCenter } = require("../governance/agent-policy-center");
const { AgentIdentityCenter } = require("../identity/agent-identity-center");
const { AgentEvolutionEngine } = require("../evolution/agent-evolution-engine");
const { AdaptiveController } = require("../adaptation/adaptive-controller");
const { AutonomyLevelManager, DEFAULT_AUTONOMY_ROOT } = require("./autonomy-level-manager");
const { DecisionBoundaryManager } = require("./decision-boundary-manager");
const { HumanInteractionManager } = require("./human-interaction-manager");

function nowIso() {
  return new Date().toISOString();
}

class AutonomyController {
  constructor({
    rootDir = DEFAULT_AUTONOMY_ROOT,
    policyCenter = null,
    identityCenter = null,
    evolutionEngine = null,
    adaptiveController = null,
    autonomyLevelManager = null,
    decisionBoundaryManager = null,
    humanInteractionManager = null
  } = {}) {
    this.rootDir = rootDir;
    this.decisionsFile = path.join(rootDir, "autonomy-decisions.json");
    this.policyCenter = policyCenter || new AgentPolicyCenter();
    this.identityCenter = identityCenter || new AgentIdentityCenter();
    this.evolutionEngine = evolutionEngine || new AgentEvolutionEngine({ identityCenter: this.identityCenter });
    this.adaptiveController = adaptiveController || new AdaptiveController();
    this.autonomyLevelManager = autonomyLevelManager || new AutonomyLevelManager({ rootDir });
    this.decisionBoundaryManager = decisionBoundaryManager || new DecisionBoundaryManager({ rootDir, policyCenter: this.policyCenter });
    this.humanInteractionManager = humanInteractionManager || new HumanInteractionManager({ rootDir });
    this.ensureStore();
  }

  control({ agentId = "default-agent", task = {}, taskType = "", currentVersion = "unknown", context = {}, environmentInput = {} } = {}) {
    const identity = this.identityCenter.getIdentity(agentId);
    const evolution = this.evolutionEngine.generateEvolutionAdvice({ agentId, taskType, currentVersion });
    const adaptation = this.adaptiveController.createAdaptation({ agentId, taskType, task: task.title || task.name || "", currentVersion, environmentInput });
    const policy = this.policyCenter.getPolicy();
    const recommendedLevel = this.autonomyLevelManager.recommendLevel({
      identity,
      evolution: evolution.evaluation,
      adaptation: adaptation.adaptation,
      policy
    });
    const level = this.autonomyLevelManager.setLevel(agentId, recommendedLevel, "autonomy control evaluation");
    const boundary = this.decisionBoundaryManager.evaluate({ task, autonomyLevel: level, context });
    const humanInteraction = boundary.requiresHuman
      ? this.humanInteractionManager.createRequest({ agentId, task, boundary })
      : null;
    const decision = {
      decisionId: `auto-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      agentId,
      taskId: task.id || task.taskId || "",
      taskType,
      autonomyLevel: level.level,
      status: boundary.status,
      recommendation: this.buildRecommendation(boundary, level, adaptation.adaptation),
      boundary,
      humanInteraction,
      identityKnown: Boolean(identity),
      governancePolicy: policy,
      evolutionSummary: {
        score: evolution.evaluation?.score || 0,
        level: evolution.evaluation?.level || ""
      },
      adaptationSummary: {
        profileId: adaptation.adaptation.profileId,
        selectedStrategy: adaptation.adaptation.selectedStrategy
      },
      safety: {
        advisoryOnly: true,
        executesTool: false,
        modifiesPermission: false,
        bypassesToolSelector: false,
        bypassesVerifierCenter: false
      },
      timestamp: nowIso()
    };
    this.append(decision);
    return decision;
  }

  buildRecommendation(boundary = {}, level = {}, adaptation = {}) {
    if (boundary.status === "confirm_required") return "Request human confirmation before continuing.";
    if (boundary.status === "policy_block") return "Stop and revise the plan because governance policy blocked it.";
    if (boundary.status === "budget_exceeded") return "Stop and reduce scope because governance budget was exceeded.";
    const strategy = adaptation.selectedStrategy?.recommendation || "Keep the normal safe execution chain.";
    return `${level.level || "assisted"} autonomy may recommend next steps. ${strategy}`;
  }

  append(item = {}) {
    const data = this.load();
    data.decisions.push(item);
    this.writeJson(this.decisionsFile, { decisions: data.decisions.slice(-500) });
  }

  load() {
    return this.readJson(this.decisionsFile, { decisions: [] });
  }

  ensureStore() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.decisionsFile)) this.writeJson(this.decisionsFile, { decisions: [] });
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

module.exports = { AutonomyController };
