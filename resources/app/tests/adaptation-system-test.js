const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const { EnvironmentDetector } = require("../services/adaptation/environment-detector");
const { EnvironmentProfileManager } = require("../services/adaptation/environment-profile-manager");
const { StrategyAdapter } = require("../services/adaptation/strategy-adapter");
const { AdaptiveController } = require("../services/adaptation/adaptive-controller");
const { AgentEvolutionEngine } = require("../services/evolution/agent-evolution-engine");
const { AgentIdentityCenter } = require("../services/identity/agent-identity-center");
const { KnowledgeCenter } = require("../services/knowledge/knowledge-center");
const { KnowledgeIndexer } = require("../services/knowledge/knowledge-indexer");
const { KnowledgeRetriever } = require("../services/knowledge/knowledge-retriever");
const { ExperienceCenter } = require("../services/experience/experience-center");
const { ReflectionMemory } = require("../services/reflection/reflection-memory");

function root(name) {
  const dir = path.join("D:\\BaiQiuAI", "data", "adaptation-tests", `run-${process.pid}`, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function run() {
  const adaptationRoot = root("adaptation");
  const evolutionRoot = root("evolution");
  const identityRoot = root("identity");
  const knowledgeRoot = root("knowledge");
  const experienceRoot = root("experience");
  const reflectionRoot = root("reflection");

  const identityCenter = new AgentIdentityCenter({ rootDir: identityRoot });
  identityCenter.registerAgent({
    agentId: "planner-agent",
    profile: {
      name: "Planner Agent",
      role: "planner",
      capabilities: ["planning", "adaptation"]
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
  new KnowledgeIndexer({ knowledgeCenter }).buildIndex();

  const experienceCenter = new ExperienceCenter({ rootDir: experienceRoot, knowledgeCenter });
  experienceCenter.record({
    taskType: "dev.code.calculator",
    toolId: "calculator_creator",
    errorType: "browser_missing",
    failedReason: "browser missing",
    solution: "open_path",
    success: true
  });

  const reflectionMemory = new ReflectionMemory({ rootDir: reflectionRoot });
  reflectionMemory.record({
    taskType: "dev.code.calculator",
    status: "success",
    reason: "stable plan",
    improvement: "prefer calculator_creator before generic html creator",
    confidence: 0.94
  });

  const detector = new EnvironmentDetector({
    rootDir: adaptationRoot,
    now: () => "2026-07-10T00:00:00.000Z"
  });
  const environment = detector.detect({
    platform: "win32",
    lowMemory: true,
    offline: true,
    restrictedStorage: true,
    hasAppsDir: false,
    browserAvailable: false
  });
  assert.strictEqual(environment.constraints.lowMemory, true);
  assert.strictEqual(environment.constraints.offline, true);
  assert.strictEqual(detector.getLatest().timestamp, "2026-07-10T00:00:00.000Z");

  const profileManager = new EnvironmentProfileManager({ rootDir: adaptationRoot });
  const profile = profileManager.upsertProfile(environment);
  assert.strictEqual(profile.profileId, "win32.low_memory");
  assert.strictEqual(profile.strategyPreferences.preferLightweightPlan, true);
  assert.strictEqual(profile.strategyPreferences.avoidNetworkDependentSteps, true);
  assert.strictEqual(profile.strategyPreferences.preferWorkspacePaths, true);
  assert.strictEqual(profile.strategyPreferences.requirePermissionForHighRisk, true);

  const evolutionEngine = new AgentEvolutionEngine({
    rootDir: evolutionRoot,
    identityCenter,
    knowledgeCenter,
    experienceCenter,
    reflectionMemory
  });
  const strategyAdapter = new StrategyAdapter({
    rootDir: adaptationRoot,
    knowledgeRetriever: new KnowledgeRetriever({ knowledgeCenter }),
    reflectionMemory,
    evolutionEngine
  });
  const strategy = strategyAdapter.adapt({
    taskType: "dev.code.calculator",
    task: "做一个计算器软件然后打开",
    agentId: "planner-agent",
    environment,
    profile,
    currentVersion: "1.1.1"
  });
  assert(strategy.strategies.some((item) => item.id === "prefer_workspace_paths"));
  assert(strategy.strategies.some((item) => item.id === "lightweight_execution"));
  assert(strategy.strategies.some((item) => item.id === "offline_first"));
  assert(strategy.strategies.some((item) => item.source === "knowledge"));
  assert(strategy.strategies.some((item) => item.source === "reflection"));
  assert(strategy.strategies.some((item) => item.source === "evolution"));
  assert.strictEqual(strategy.safety.advisoryOnly, true);
  assert.strictEqual(strategy.safety.modifiesPermission, false);

  const controller = new AdaptiveController({
    rootDir: adaptationRoot,
    environmentDetector: detector,
    environmentProfileManager: profileManager,
    strategyAdapter
  });
  const result = controller.createAdaptation({
    taskType: "dev.code.calculator",
    task: "做一个计算器软件然后打开",
    agentId: "planner-agent",
    currentVersion: "1.1.1",
    environmentInput: {
      platform: "win32",
      lowMemory: true,
      offline: true,
      restrictedStorage: true,
      hasAppsDir: false
    }
  });
  assert(result.adaptation.selectedStrategy);
  assert.strictEqual(result.adaptation.safety.advisoryOnly, true);
  assert.strictEqual(result.adaptation.safety.modifiesPermission, false);
  assert.strictEqual(result.adaptation.safety.bypassesToolSelector, false);
  assert.strictEqual(result.adaptation.safety.bypassesVerifierCenter, false);

  const serialized = JSON.stringify(result);
  assert(!serialized.includes("ToolSelector.execute"), "adaptation layer must not bypass ToolSelector");
  assert(!serialized.includes("VerifierCenter.verify"), "adaptation layer must not bypass VerifierCenter");
  assert(!serialized.includes("PermissionManager.allowAll"), "adaptation layer must not alter permissions");

  assert(fs.existsSync(path.join(adaptationRoot, "environment-snapshots.json")));
  assert(fs.existsSync(path.join(adaptationRoot, "environment-profiles.json")));
  assert(fs.existsSync(path.join(adaptationRoot, "adaptive-strategies.json")));
  assert(fs.existsSync(path.join(adaptationRoot, "adaptations.json")));

  return {
    ok: true,
    cases: [
      "environment_detector_captures_constraints",
      "environment_profile_manager_derives_preferences",
      "strategy_adapter_uses_evolution_knowledge_reflection",
      "adaptive_controller_generates_strategy",
      "adaptation_layer_no_execution_bypass"
    ]
  };
}

if (require.main === module) console.log(JSON.stringify(run(), null, 2));

module.exports = { run };
