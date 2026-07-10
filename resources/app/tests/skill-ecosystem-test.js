const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const { SkillRegistry } = require("../services/skill-ecosystem/skill-registry");
const { SkillManager } = require("../services/skill-ecosystem/skill-manager");
const { SkillDiscovery } = require("../services/skill-ecosystem/skill-discovery");
const { SkillVersionManager } = require("../services/skill-ecosystem/skill-version-manager");
const { SkillEvaluator } = require("../services/skill-ecosystem/skill-evaluator");
const { KnowledgeCenter } = require("../services/knowledge/knowledge-center");
const { WorkflowEngine } = require("../services/workflow/workflow-engine");
const { ReflectionMemory } = require("../services/reflection/reflection-memory");
const { AgentEvolutionEngine } = require("../services/evolution/agent-evolution-engine");

function root(name) {
  const dir = path.join("D:\\BaiQiuAI", "data", "skill-ecosystem-tests", `run-${process.pid}`, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function run() {
  const skillRoot = root("skill-ecosystem");
  const knowledgeRoot = root("knowledge");
  const workflowRoot = root("workflow");
  const reflectionRoot = root("reflection");
  const evolutionRoot = root("evolution");

  const knowledgeCenter = new KnowledgeCenter({ rootDir: knowledgeRoot });
  knowledgeCenter.addKnowledge({
    type: "skill",
    taskType: "dev.code.calculator",
    capability: "calculator_application_creation",
    skill: "calculator_skill",
    source: "calculator skill knowledge",
    successRate: 0.95,
    successCount: 10
  });

  const reflectionMemory = new ReflectionMemory({ rootDir: reflectionRoot });
  reflectionMemory.record({
    taskType: "dev.code.calculator",
    status: "success",
    improvement: "calculator skill should prefer managed workflow",
    confidence: 0.9
  });

  const workflowEngine = new WorkflowEngine({ rootDir: workflowRoot });
  const evolutionEngine = new AgentEvolutionEngine({ rootDir: evolutionRoot, knowledgeCenter, reflectionMemory });
  const registry = new SkillRegistry({ rootDir: skillRoot });
  const versionManager = new SkillVersionManager({ rootDir: skillRoot });
  const discovery = new SkillDiscovery({ rootDir: skillRoot, skillRegistry: registry, knowledgeCenter, workflowEngine, reflectionMemory });
  const evaluator = new SkillEvaluator({ rootDir: skillRoot, knowledgeCenter, reflectionMemory, evolutionEngine });
  const manager = new SkillManager({
    rootDir: skillRoot,
    registry,
    discovery,
    versionManager,
    evaluator,
    knowledgeCenter,
    workflowEngine,
    reflectionMemory,
    evolutionEngine
  });

  const registered = registry.register({
    skillId: "calculator_skill",
    name: "Calculator Skill",
    description: "Managed calculator application creation skill",
    status: "installed",
    taskTypes: ["dev.code.calculator"],
    capabilities: ["calculator_application_creation"],
    workflows: ["calculator_workflow"],
    tools: ["calculator_creator"]
  });
  assert.strictEqual(registered.skillId, "calculator_skill");
  assert.strictEqual(registered.safety.executesTool, false);
  assert(registry.query({ taskType: "dev.code.calculator" }).length >= 1);

  const version1 = versionManager.createVersion(registered, { changes: "initial version" });
  const version2 = versionManager.createVersion(registered, { changes: "metadata update" });
  assert.strictEqual(version1.version, "1.0.0");
  assert.strictEqual(version2.version, "1.0.1");
  assert.strictEqual(versionManager.getLatest("calculator_skill").version, "1.0.1");

  const evaluation = evaluator.evaluate({ ...registered, version: version2.version }, { agentId: "planner-agent" });
  assert(evaluation.score > 50);
  assert.strictEqual(evaluation.safety.executesTool, false);

  const managed = manager.registerSkill({
    skillId: "html_skill",
    name: "HTML App Skill",
    description: "Managed HTML application skill",
    status: "registered",
    taskTypes: ["dev.code.html"],
    capabilities: ["html_application_creation"],
    workflows: ["calculator_workflow"],
    tools: ["html_app_creator"]
  });
  assert.strictEqual(managed.skill.skillId, "html_skill");
  assert(managed.version.version);
  assert(managed.evaluation.score > 0);
  assert.strictEqual(managed.event.safety.executesTool, false);

  const discovered = manager.discoverSkills({ taskType: "dev.code.calculator", keyword: "calculator" });
  assert(discovered.registryMatches.some((item) => item.skillId === "calculator_skill"));
  assert(discovered.knowledgeMatches.some((item) => item.skill === "calculator_skill"));
  assert(discovered.recommendations.length >= 1);
  assert.strictEqual(discovered.safety.executesTool, false);

  const known = knowledgeCenter.queryKnowledge({ type: "skill" });
  assert(known.some((item) => item.skill === "html_skill"), "manager should sync managed skills into KnowledgeCenter");

  const serialized = JSON.stringify([registered, version2, evaluation, managed, discovered]);
  assert(!serialized.includes("ToolSelector.execute"), "skill ecosystem layer must not bypass ToolSelector");
  assert(!serialized.includes("VerifierCenter.verify"), "skill ecosystem layer must not bypass VerifierCenter");
  assert(!serialized.includes("PermissionManager.allowAll"), "skill ecosystem layer must not alter permissions");

  assert(fs.existsSync(path.join(skillRoot, "skill-registry.json")));
  assert(fs.existsSync(path.join(skillRoot, "skill-manager.json")));
  assert(fs.existsSync(path.join(skillRoot, "skill-discovery.json")));
  assert(fs.existsSync(path.join(skillRoot, "skill-versions.json")));
  assert(fs.existsSync(path.join(skillRoot, "skill-evaluations.json")));

  return {
    ok: true,
    cases: [
      "skill_registry_registers_skills",
      "skill_manager_coordinates_ecosystem",
      "skill_discovery_finds_registry_and_knowledge",
      "skill_version_manager_tracks_versions",
      "skill_evaluator_scores_skills",
      "skill_ecosystem_connects_knowledge_workflow_reflection_evolution",
      "skill_ecosystem_layer_no_execution_bypass"
    ]
  };
}

if (require.main === module) console.log(JSON.stringify(run(), null, 2));

module.exports = { run };
