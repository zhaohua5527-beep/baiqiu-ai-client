const fs = require("node:fs");
const path = require("node:path");
const { GoalManager } = require("../goal/goal-manager");
const { TaskLifecycleManager } = require("../task-lifecycle/task-lifecycle-manager");
const { KnowledgeRetriever } = require("../knowledge/knowledge-retriever");
const { ReflectionMemory } = require("../reflection/reflection-memory");
const { AutonomyLevelManager } = require("../autonomy/autonomy-level-manager");
const { WorkflowDefinition, DEFAULT_WORKFLOW_ROOT } = require("./workflow-definition");
const { WorkflowRunner } = require("./workflow-runner");
const { WorkflowTemplateManager } = require("./workflow-template-manager");

function nowIso() {
  return new Date().toISOString();
}

class WorkflowEngine {
  constructor({
    rootDir = DEFAULT_WORKFLOW_ROOT,
    goalManager = null,
    taskLifecycleManager = null,
    knowledgeRetriever = null,
    reflectionMemory = null,
    autonomyLevelManager = null,
    workflowDefinition = null,
    workflowRunner = null,
    templateManager = null
  } = {}) {
    this.rootDir = rootDir;
    this.workflowsFile = path.join(rootDir, "workflows.json");
    this.knowledgeRetriever = knowledgeRetriever || new KnowledgeRetriever();
    this.reflectionMemory = reflectionMemory || new ReflectionMemory();
    this.autonomyLevelManager = autonomyLevelManager || new AutonomyLevelManager();
    this.goalManager = goalManager || new GoalManager({ knowledgeRetriever: this.knowledgeRetriever, reflectionMemory: this.reflectionMemory, autonomyLevelManager: this.autonomyLevelManager });
    this.taskLifecycleManager = taskLifecycleManager || new TaskLifecycleManager({ goalManager: this.goalManager, knowledgeRetriever: this.knowledgeRetriever, reflectionMemory: this.reflectionMemory, autonomyLevelManager: this.autonomyLevelManager });
    this.workflowDefinition = workflowDefinition || new WorkflowDefinition({ rootDir });
    this.workflowRunner = workflowRunner || new WorkflowRunner({ rootDir, autonomyLevelManager: this.autonomyLevelManager });
    this.templateManager = templateManager || new WorkflowTemplateManager({ rootDir });
    this.ensureStore();
  }

  createWorkflow({ input = "", agentId = "default-agent", conversation = [] } = {}) {
    const lifecycleBundle = this.taskLifecycleManager.createLifecycle({ input, agentId, conversation });
    const template = this.templateManager.select({ taskType: lifecycleBundle.goal.taskType, goal: lifecycleBundle.goal });
    const definition = this.workflowDefinition.create({
      goal: lifecycleBundle.goal,
      lifecycle: lifecycleBundle.lifecycle,
      tasks: lifecycleBundle.tasks,
      template,
      agentId
    });
    const knowledgeHints = this.knowledgeRetriever.retrieve({ task: input, taskType: lifecycleBundle.goal.taskType });
    const reflectionHints = this.reflectionMemory.getHints({ taskType: lifecycleBundle.goal.taskType });
    const run = this.workflowRunner.start(definition);
    const workflow = {
      workflowId: definition.workflowId,
      runId: run.runId,
      agentId,
      goalId: lifecycleBundle.goal.goalId,
      lifecycleId: lifecycleBundle.lifecycle.lifecycleId,
      taskType: lifecycleBundle.goal.taskType,
      status: "running",
      definition,
      run,
      knowledgeHints,
      reflectionHints,
      safety: this.safety(),
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    this.saveWorkflow(workflow);
    return { workflow, definition, run, lifecycle: lifecycleBundle.lifecycle, goal: lifecycleBundle.goal, tasks: lifecycleBundle.tasks };
  }

  advanceWorkflow(runId = "", update = {}) {
    const run = this.workflowRunner.advance(runId, update);
    if (!run) return null;
    const data = this.load();
    const workflow = Object.values(data.workflows).find((item) => item.runId === runId);
    if (workflow) {
      workflow.run = run;
      workflow.status = run.status;
      workflow.updatedAt = nowIso();
      data.workflows[workflow.workflowId] = workflow;
      this.writeJson(this.workflowsFile, { workflows: data.workflows });
    }
    return run;
  }

  getWorkflow(workflowId = "") {
    return this.load().workflows[workflowId] || null;
  }

  saveWorkflow(workflow = {}) {
    const data = this.load();
    data.workflows[workflow.workflowId] = workflow;
    this.writeJson(this.workflowsFile, { workflows: data.workflows });
  }

  load() {
    return this.readJson(this.workflowsFile, { workflows: {} });
  }

  safety() {
    return {
      workflowOnly: true,
      executesTool: false,
      bypassesToolSelector: false,
      bypassesVerifierCenter: false
    };
  }

  ensureStore() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.workflowsFile)) this.writeJson(this.workflowsFile, { workflows: {} });
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

module.exports = { WorkflowEngine };
