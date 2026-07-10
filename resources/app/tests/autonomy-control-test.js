const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const { AutonomyController } = require("../services/autonomy/autonomy-controller");
const { AutonomyLevelManager } = require("../services/autonomy/autonomy-level-manager");
const { DecisionBoundaryManager } = require("../services/autonomy/decision-boundary-manager");
const { HumanInteractionManager } = require("../services/autonomy/human-interaction-manager");
const { AgentPolicyCenter } = require("../services/governance/agent-policy-center");
const { AgentIdentityCenter } = require("../services/identity/agent-identity-center");
const { AgentEvolutionEngine } = require("../services/evolution/agent-evolution-engine");
const { AdaptiveController } = require("../services/adaptation/adaptive-controller");
const { KnowledgeCenter } = require("../services/knowledge/knowledge-center");
const { ExperienceCenter } = require("../services/experience/experience-center");
const { ReflectionMemory } = require("../services/reflection/reflection-memory");

function root(name) {
  const dir = path.join("D:\\BaiQiuAI", "data", "autonomy-tests", `run-${process.pid}`, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function run() {
  const autonomyRoot = root("autonomy");
  const governanceRoot = root("governance");
  const identityRoot = root("identity");
  const evolutionRoot = root("evolution");
  const adaptationRoot = root("adaptation");
  const knowledgeRoot = root("knowledge");
  const experienceRoot = root("experience");
  const reflectionRoot = root("reflection");

  const policyCenter = new AgentPolicyCenter({ rootDir: governanceRoot });
  policyCenter.updatePolicy({ highRiskRequireConfirm: true, maxSteps: 50, maxToolCalls: 100 });

  const identityCenter = new AgentIdentityCenter({ rootDir: identityRoot });
  identityCenter.registerAgent({
    agentId: "planner-agent",
    profile: {
      name: "Planner Agent",
      role: "planner",
      capabilities: ["planning", "autonomy"]
    }
  });

  const knowledgeCenter = new KnowledgeCenter({ rootDir: knowledgeRoot });
  knowledgeCenter.addKnowledge({
    type: "task",
    taskType: "dev.code.calculator",
    toolId: "calculator_creator",
    capability: "calculator_application_creation",
    successRate: 0.99,
    successCount: 30,
    failCount: 1
  });
  const experienceCenter = new ExperienceCenter({ rootDir: experienceRoot, knowledgeCenter });
  experienceCenter.record({
    taskType: "dev.code.calculator",
    toolId: "calculator_creator",
    errorType: "invalid_path",
    failedReason: "path issue",
    solution: "use_internal_app_path",
    success: true
  });
  const reflectionMemory = new ReflectionMemory({ rootDir: reflectionRoot });
  reflectionMemory.record({
    taskType: "dev.code.calculator",
    status: "success",
    reason: "stable calculator path",
    improvement: "keep calculator direct strategy",
    confidence: 0.95
  });

  const evolutionEngine = new AgentEvolutionEngine({
    rootDir: evolutionRoot,
    identityCenter,
    knowledgeCenter,
    experienceCenter,
    reflectionMemory
  });
  const adaptiveController = new AdaptiveController({ rootDir: adaptationRoot });

  const levelManager = new AutonomyLevelManager({ rootDir: autonomyRoot });
  const recommended = levelManager.recommendLevel({
    identity: identityCenter.getIdentity("planner-agent"),
    evolution: { score: 95 },
    adaptation: { selectedStrategy: { id: "safe" } },
    policy: policyCenter.getPolicy()
  });
  assert.strictEqual(recommended, "supervised");
  const level = levelManager.setLevel("planner-agent", recommended, "test");
  assert.strictEqual(level.allowToolExecution, false);

  const boundaryManager = new DecisionBoundaryManager({ rootDir: autonomyRoot, policyCenter });
  const lowRisk = boundaryManager.evaluate({
    task: { id: "create-file", toolId: "file_creator", riskLevel: "low" },
    autonomyLevel: level,
    context: { stepCount: 1, toolCalls: 0 }
  });
  assert.strictEqual(lowRisk.allowedToExecute, false);
  assert.strictEqual(lowRisk.status, "recommendation_allowed");

  const highRisk = boundaryManager.evaluate({
    task: { id: "shutdown", toolId: "system_shutdown", riskLevel: "high", needUserConfirm: true, permissionScope: "system" },
    autonomyLevel: level,
    context: { stepCount: 1, toolCalls: 0 }
  });
  assert.strictEqual(highRisk.requiresHuman, true);
  assert.strictEqual(highRisk.status, "confirm_required");

  const interactionManager = new HumanInteractionManager({ rootDir: autonomyRoot });
  const request = interactionManager.createRequest({
    agentId: "planner-agent",
    task: { id: "shutdown", toolId: "system_shutdown" },
    boundary: highRisk
  });
  assert.strictEqual(request.status, "pending");
  assert.strictEqual(request.safety.executesTool, false);
  const rejected = interactionManager.recordResponse(request.interactionId, { approved: false, note: "test reject" });
  assert.strictEqual(rejected.status, "rejected");

  const controller = new AutonomyController({
    rootDir: autonomyRoot,
    policyCenter,
    identityCenter,
    evolutionEngine,
    adaptiveController,
    autonomyLevelManager: levelManager,
    decisionBoundaryManager: boundaryManager,
    humanInteractionManager: interactionManager
  });
  const decision = controller.control({
    agentId: "planner-agent",
    taskType: "dev.code.calculator",
    currentVersion: "1.1.1",
    task: {
      id: "shutdown",
      toolId: "system_shutdown",
      riskLevel: "high",
      needUserConfirm: true,
      permissionScope: "system",
      title: "shutdown"
    },
    context: { stepCount: 1, toolCalls: 0 },
    environmentInput: { platform: "win32" }
  });
  assert.strictEqual(decision.status, "confirm_required");
  assert(decision.humanInteraction, "high risk decision should create human interaction request");
  assert.strictEqual(decision.safety.advisoryOnly, true);
  assert.strictEqual(decision.safety.executesTool, false);
  assert.strictEqual(decision.safety.modifiesPermission, false);
  assert.strictEqual(decision.safety.bypassesToolSelector, false);
  assert.strictEqual(decision.safety.bypassesVerifierCenter, false);

  const serialized = JSON.stringify(decision);
  assert(!serialized.includes("ToolSelector.execute"), "autonomy layer must not bypass ToolSelector");
  assert(!serialized.includes("VerifierCenter.verify"), "autonomy layer must not bypass VerifierCenter");
  assert(!serialized.includes("PermissionManager.allowAll"), "autonomy layer must not alter permissions");

  assert(fs.existsSync(path.join(autonomyRoot, "autonomy-levels.json")));
  assert(fs.existsSync(path.join(autonomyRoot, "decision-boundaries.json")));
  assert(fs.existsSync(path.join(autonomyRoot, "human-interactions.json")));
  assert(fs.existsSync(path.join(autonomyRoot, "autonomy-decisions.json")));

  return {
    ok: true,
    cases: [
      "autonomy_level_manager_recommends_level",
      "decision_boundary_manager_requires_confirmation",
      "human_interaction_manager_records_request",
      "autonomy_controller_connects_governance_identity_evolution_adaptation",
      "autonomy_layer_no_execution_bypass"
    ]
  };
}

if (require.main === module) console.log(JSON.stringify(run(), null, 2));

module.exports = { run };
