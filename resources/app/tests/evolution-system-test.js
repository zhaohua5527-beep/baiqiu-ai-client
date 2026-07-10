const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const { AgentEvolutionEngine } = require("../services/evolution/agent-evolution-engine");
const { CapabilityGrowthManager } = require("../services/evolution/capability-growth-manager");
const { VersionEvolutionManager } = require("../services/evolution/version-evolution-manager");
const { EvolutionEvaluator } = require("../services/evolution/evolution-evaluator");
const { AgentIdentityCenter } = require("../services/identity/agent-identity-center");
const { KnowledgeCenter } = require("../services/knowledge/knowledge-center");
const { ExperienceCenter } = require("../services/experience/experience-center");
const { ReflectionMemory } = require("../services/reflection/reflection-memory");

function root(name) {
  const dir = path.join("D:\\BaiQiuAI", "data", "evolution-tests", `run-${process.pid}`, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function run() {
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
      capabilities: ["planning", "reasoning"]
    }
  });

  const knowledgeCenter = new KnowledgeCenter({ rootDir: knowledgeRoot });
  knowledgeCenter.addKnowledge({
    type: "task",
    source: "calculator success",
    taskType: "dev.code.calculator",
    toolId: "calculator_creator",
    capability: "calculator_application_creation",
    successRate: 0.98,
    successCount: 20,
    failCount: 1
  });

  const experienceCenter = new ExperienceCenter({ rootDir: experienceRoot, knowledgeCenter });
  experienceCenter.record({
    taskType: "dev.code.calculator",
    toolId: "calculator_creator",
    errorType: "invalid_path",
    failedReason: "internal app path needed",
    solution: "use_internal_app_path",
    success: true
  });

  const reflectionMemory = new ReflectionMemory({ rootDir: reflectionRoot });
  reflectionMemory.record({
    taskType: "dev.code.calculator",
    status: "success",
    reason: "calculator direct strategy is stable",
    improvement: "keep calculator_creator as preferred calculator strategy",
    confidence: 0.96
  });
  reflectionMemory.record({
    taskType: "system.shutdown",
    status: "failed",
    errorType: "permission_denied",
    reason: "permission denied",
    improvement: "should not affect policy",
    confidence: 1
  });

  const growthManager = new CapabilityGrowthManager({
    rootDir: evolutionRoot,
    knowledgeCenter,
    experienceCenter,
    reflectionMemory
  });
  const growth = growthManager.analyze({ agentId: "planner-agent", taskType: "dev.code.calculator" });
  assert(growth.recommendedCapabilities.includes("calculator_application_creation"));
  assert(growth.suggestions.some((item) => item.action === "grow"));

  const evaluator = new EvolutionEvaluator({ rootDir: evolutionRoot });
  const evaluation = evaluator.evaluate({
    identity: identityCenter.getIdentity("planner-agent"),
    growth,
    knowledgeCount: 2,
    experienceCount: 1,
    reflectionCount: 1
  });
  assert(evaluation.score > 0);
  assert(["collecting", "growing", "mature"].includes(evaluation.level));

  const versionManager = new VersionEvolutionManager({ rootDir: evolutionRoot });
  const proposal = versionManager.propose({
    agentId: "planner-agent",
    currentVersion: "1.1.1",
    growth,
    evaluation
  });
  assert.strictEqual(proposal.safety.modifiesPermission, false);
  assert.strictEqual(proposal.safety.bypassesToolSelector, false);
  assert.strictEqual(proposal.safety.bypassesVerifierCenter, false);

  const engine = new AgentEvolutionEngine({
    rootDir: evolutionRoot,
    identityCenter,
    knowledgeCenter,
    experienceCenter,
    reflectionMemory,
    capabilityGrowthManager: growthManager,
    versionEvolutionManager: versionManager,
    evolutionEvaluator: evaluator
  });
  const advice = engine.generateEvolutionAdvice({
    agentId: "planner-agent",
    taskType: "dev.code.calculator",
    currentVersion: "1.1.1"
  });
  assert.strictEqual(advice.identityKnown, true);
  assert(advice.recommendations.length >= 2);
  assert.strictEqual(advice.safety.advisoryOnly, true);
  assert.strictEqual(advice.safety.modifiesCorePermission, false);
  assert.strictEqual(advice.safety.bypassesToolSelector, false);
  assert.strictEqual(advice.safety.bypassesVerifierCenter, false);

  const serialized = JSON.stringify(advice);
  assert(!serialized.includes("ToolSelector.execute"), "evolution layer must not bypass ToolSelector");
  assert(!serialized.includes("VerifierCenter.verify"), "evolution layer must not bypass VerifierCenter");
  assert(!serialized.includes("PermissionManager.allowAll"), "evolution layer must not alter permissions");

  assert(fs.existsSync(path.join(evolutionRoot, "evolution.json")));
  assert(fs.existsSync(path.join(evolutionRoot, "capability-growth.json")));
  assert(fs.existsSync(path.join(evolutionRoot, "version-evolution.json")));
  assert(fs.existsSync(path.join(evolutionRoot, "evaluations.json")));

  return {
    ok: true,
    cases: [
      "evolution_engine_generates_advice",
      "capability_growth_manager_recommends_growth",
      "version_evolution_manager_is_advisory",
      "evolution_evaluator_scores_context",
      "identity_knowledge_experience_reflection_connected",
      "evolution_layer_no_execution_bypass"
    ]
  };
}

if (require.main === module) console.log(JSON.stringify(run(), null, 2));

module.exports = { run };
