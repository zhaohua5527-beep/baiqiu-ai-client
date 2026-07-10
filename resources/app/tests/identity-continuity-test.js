const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const { AgentIdentityCenter } = require("../services/identity/agent-identity-center");
const { AgentProfileManager } = require("../services/identity/agent-profile-manager");
const { AgentLifecycleManager } = require("../services/identity/agent-lifecycle-manager");
const { AgentContinuityMemory } = require("../services/identity/agent-continuity-memory");
const { ExperienceCenter } = require("../services/experience/experience-center");
const { KnowledgeCenter } = require("../services/knowledge/knowledge-center");
const { ReflectionMemory } = require("../services/reflection/reflection-memory");

function root(name) {
  const dir = path.join("D:\\BaiQiuAI", "data", "identity-tests", `run-${process.pid}`, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function run() {
  const identityRoot = root("identity");
  const experienceRoot = root("experience");
  const knowledgeRoot = root("knowledge");
  const reflectionRoot = root("reflection");

  const knowledgeCenter = new KnowledgeCenter({ rootDir: knowledgeRoot });
  const experienceCenter = new ExperienceCenter({ rootDir: experienceRoot, knowledgeCenter });
  const reflectionMemory = new ReflectionMemory({ rootDir: reflectionRoot });

  experienceCenter.record({
    taskType: "dev.code.calculator",
    toolId: "calculator_creator",
    errorType: "invalid_path",
    failedReason: "path invalid",
    solution: "use_workspace",
    success: true
  });
  knowledgeCenter.addKnowledge({
    type: "task",
    taskType: "dev.code.calculator",
    toolId: "calculator_creator",
    successRate: 0.99,
    source: "calculator success"
  });
  reflectionMemory.record({
    taskType: "dev.code.calculator",
    reason: "success",
    improvement: "keep calculator strategy",
    confidence: 0.95,
    status: "success"
  });

  const profileManager = new AgentProfileManager({ rootDir: identityRoot });
  const profile = profileManager.upsertProfile("planner-agent", {
    name: "Planner Agent",
    role: "planner",
    capabilities: ["planning", "decomposition"]
  });
  assert.strictEqual(profile.agentId, "planner-agent");
  assert(profile.capabilities.includes("planning"));
  assert.strictEqual(profileManager.getProfile("planner-agent").role, "planner");

  const lifecycleManager = new AgentLifecycleManager({ rootDir: identityRoot });
  lifecycleManager.transition("planner-agent", "active", { sessionId: "identity-test" });
  const paused = lifecycleManager.transition("planner-agent", "paused", { reason: "test" });
  assert.strictEqual(paused.status, "paused");
  assert.strictEqual(paused.history.length, 2);

  const continuityMemory = new AgentContinuityMemory({
    rootDir: identityRoot,
    experienceCenter,
    knowledgeCenter,
    reflectionMemory
  });
  const snapshot = continuityMemory.saveSnapshot("planner-agent");
  assert.strictEqual(snapshot.experienceCount, 1);
  assert(snapshot.knowledgeCount >= 2, "experience sync plus explicit knowledge should be visible");
  assert.strictEqual(snapshot.reflectionCount, 1);
  assert.strictEqual(snapshot.improvementCount, 1);
  assert(continuityMemory.getContinuityPrompt("planner-agent").includes("keep calculator strategy"));

  const center = new AgentIdentityCenter({
    rootDir: identityRoot,
    profileManager,
    lifecycleManager,
    continuityMemory
  });
  const registered = center.registerAgent({
    agentId: "executor-agent",
    profile: {
      name: "Executor Agent",
      role: "executor",
      capabilities: ["execute"]
    }
  });
  assert.strictEqual(registered.identity.agentId, "executor-agent");
  assert.strictEqual(registered.profile.role, "executor");
  assert.strictEqual(center.getIdentity("executor-agent").lifecycle.status, "registered");
  const refreshed = center.refreshContinuity("executor-agent");
  assert(refreshed.updatedAt, "continuity refresh should return timestamp");

  const serialized = JSON.stringify(center.getIdentity("executor-agent"));
  assert(!serialized.includes("ToolSelector.execute"), "identity layer must not bypass ToolSelector");
  assert(!serialized.includes("VerifierCenter.verify"), "identity layer must not bypass VerifierCenter");

  assert(fs.existsSync(path.join(identityRoot, "identities.json")));
  assert(fs.existsSync(path.join(identityRoot, "profiles.json")));
  assert(fs.existsSync(path.join(identityRoot, "lifecycle.json")));
  assert(fs.existsSync(path.join(identityRoot, "continuity.json")));

  return {
    ok: true,
    cases: [
      "agent_identity_registered",
      "profile_manager_persists_profile",
      "lifecycle_manager_tracks_transitions",
      "continuity_memory_reads_experience_knowledge_reflection",
      "identity_layer_no_execution_bypass"
    ]
  };
}

if (require.main === module) console.log(JSON.stringify(run(), null, 2));

module.exports = { run };
