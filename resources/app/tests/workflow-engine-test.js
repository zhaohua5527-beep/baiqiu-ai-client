const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const { WorkflowEngine } = require("../services/workflow/workflow-engine");
const { WorkflowDefinition } = require("../services/workflow/workflow-definition");
const { WorkflowRunner } = require("../services/workflow/workflow-runner");
const { WorkflowTemplateManager } = require("../services/workflow/workflow-template-manager");
const { TaskLifecycleManager } = require("../services/task-lifecycle/task-lifecycle-manager");
const { GoalManager } = require("../services/goal/goal-manager");
const { KnowledgeCenter } = require("../services/knowledge/knowledge-center");
const { KnowledgeIndexer } = require("../services/knowledge/knowledge-indexer");
const { KnowledgeRetriever } = require("../services/knowledge/knowledge-retriever");
const { AgentIdentityCenter } = require("../services/identity/agent-identity-center");
const { ReflectionMemory } = require("../services/reflection/reflection-memory");
const { AutonomyLevelManager } = require("../services/autonomy/autonomy-level-manager");

function root(name) {
  const dir = path.join("D:\\BaiQiuAI", "data", "workflow-tests", `run-${process.pid}`, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function run() {
  const workflowRoot = root("workflow");
  const lifecycleRoot = root("task-lifecycle");
  const goalRoot = root("goal");
  const knowledgeRoot = root("knowledge");
  const identityRoot = root("identity");
  const reflectionRoot = root("reflection");
  const autonomyRoot = root("autonomy");

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
  const knowledgeRetriever = new KnowledgeRetriever({ knowledgeCenter });

  const identityCenter = new AgentIdentityCenter({ rootDir: identityRoot });
  identityCenter.registerAgent({ agentId: "planner-agent", profile: { role: "planner", capabilities: ["workflow"] } });

  const reflectionMemory = new ReflectionMemory({ rootDir: reflectionRoot });
  reflectionMemory.record({
    taskType: "dev.code.calculator",
    status: "success",
    improvement: "calculator workflow should keep create before open",
    confidence: 0.95
  });

  const autonomyLevelManager = new AutonomyLevelManager({ rootDir: autonomyRoot });
  autonomyLevelManager.setLevel("planner-agent", "supervised", "workflow test");

  const goalManager = new GoalManager({
    rootDir: goalRoot,
    knowledgeRetriever,
    identityCenter,
    reflectionMemory,
    autonomyLevelManager
  });
  const taskLifecycleManager = new TaskLifecycleManager({
    rootDir: lifecycleRoot,
    goalManager,
    knowledgeRetriever,
    reflectionMemory,
    autonomyLevelManager
  });
  const templateManager = new WorkflowTemplateManager({ rootDir: workflowRoot });
  const definitionService = new WorkflowDefinition({ rootDir: workflowRoot });
  const runner = new WorkflowRunner({ rootDir: workflowRoot, autonomyLevelManager });
  const engine = new WorkflowEngine({
    rootDir: workflowRoot,
    goalManager,
    taskLifecycleManager,
    knowledgeRetriever,
    reflectionMemory,
    autonomyLevelManager,
    workflowDefinition: definitionService,
    workflowRunner: runner,
    templateManager
  });

  const template = templateManager.select({ taskType: "dev.code.calculator" });
  assert.strictEqual(template.templateId, "calculator_workflow");

  const bundle = engine.createWorkflow({
    input: "帮我写一个计算器软件放桌面，然后打开",
    agentId: "planner-agent"
  });
  assert(bundle.workflow.workflowId);
  assert.strictEqual(bundle.workflow.safety.executesTool, false);
  assert.strictEqual(bundle.definition.safety.executesTool, false);
  assert(bundle.definition.nodes.length >= 2);
  assert(bundle.definition.edges.length >= 1);
  assert.strictEqual(bundle.run.status, "running");
  assert.strictEqual(bundle.run.safety.executesTool, false);
  assert(bundle.workflow.knowledgeHints.recommendedTools.includes("calculator_creator"));
  assert(bundle.workflow.reflectionHints.available);

  const first = runner.advance(bundle.run.runId);
  assert(first.currentNodeId, "runner should advance first ready node");
  assert.strictEqual(first.safety.executesTool, false);
  let run = first;
  for (let i = 0; i < 10 && run.status !== "completed"; i += 1) run = engine.advanceWorkflow(bundle.run.runId);
  assert.strictEqual(run.status, "completed");

  const highRisk = engine.createWorkflow({
    input: "帮我关闭电脑",
    agentId: "planner-agent"
  });
  assert(highRisk.definition.nodes.some((node) => node.riskLevel === "high"));
  assert.strictEqual(highRisk.workflow.safety.executesTool, false);

  const serialized = JSON.stringify([bundle, run, highRisk]);
  assert(!serialized.includes("ToolSelector.execute"), "workflow layer must not bypass ToolSelector");
  assert(!serialized.includes("VerifierCenter.verify"), "workflow layer must not bypass VerifierCenter");
  assert(!serialized.includes("PermissionManager.allowAll"), "workflow layer must not alter permissions");

  assert(fs.existsSync(path.join(workflowRoot, "workflows.json")));
  assert(fs.existsSync(path.join(workflowRoot, "workflow-definitions.json")));
  assert(fs.existsSync(path.join(workflowRoot, "workflow-runs.json")));
  assert(fs.existsSync(path.join(workflowRoot, "workflow-templates.json")));

  return {
    ok: true,
    cases: [
      "workflow_engine_creates_managed_workflow",
      "workflow_definition_builds_nodes_and_edges",
      "workflow_runner_advances_without_execution",
      "workflow_template_manager_selects_template",
      "workflow_connects_goal_task_lifecycle_knowledge_reflection_autonomy",
      "workflow_layer_no_execution_bypass"
    ]
  };
}

if (require.main === module) console.log(JSON.stringify(run(), null, 2));

module.exports = { run };
