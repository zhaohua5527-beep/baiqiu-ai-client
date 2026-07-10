const fs = require("node:fs");
const path = require("node:path");
const { DEFAULT_CONTEXT_MANAGEMENT_ROOT } = require("./context-priority-engine");
const { MemoryCore } = require("../memory-architecture/memory-core");
const { KnowledgeRetriever } = require("../knowledge/knowledge-retriever");
const { GoalManager } = require("../goal/goal-manager");
const { SkillRegistry } = require("../skill-ecosystem/skill-registry");
const { WorkflowEngine } = require("../workflow/workflow-engine");
const { ReflectionMemory } = require("../reflection/reflection-memory");

function nowIso() {
  return new Date().toISOString();
}

function contextItem(input = {}) {
  return {
    contextId: input.contextId || `ctx-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    scope: input.scope || "context",
    type: input.type || input.scope || "context",
    source: input.source || "",
    taskType: input.taskType || "",
    content: String(input.content || "").slice(0, 3000),
    tags: Array.isArray(input.tags) ? input.tags : [],
    confidence: Number.isFinite(Number(input.confidence)) ? Number(input.confidence) : 0.75,
    critical: input.critical === true,
    timestamp: input.timestamp || nowIso()
  };
}

class ContextBuilder {
  constructor({
    rootDir = DEFAULT_CONTEXT_MANAGEMENT_ROOT,
    memoryCore = null,
    knowledgeRetriever = null,
    goalManager = null,
    skillRegistry = null,
    workflowEngine = null,
    reflectionMemory = null
  } = {}) {
    this.rootDir = rootDir;
    this.filePath = path.join(rootDir, "context-builder.json");
    this.memoryCore = memoryCore || new MemoryCore();
    this.knowledgeRetriever = knowledgeRetriever || new KnowledgeRetriever();
    this.goalManager = goalManager || new GoalManager();
    this.skillRegistry = skillRegistry || new SkillRegistry();
    this.workflowEngine = workflowEngine || new WorkflowEngine();
    this.reflectionMemory = reflectionMemory || new ReflectionMemory();
    this.ensureStore();
  }

  build({ input = "", taskType = "", agentId = "default-agent", activeContext = [] } = {}) {
    const items = [];
    for (const item of activeContext) {
      items.push(contextItem({ ...item, scope: item.scope || "active", source: item.source || "active_context", critical: item.critical === true }));
    }

    const memory = this.memoryCore.retrieve?.({ keyword: input, taskType, limit: 12 }) || { memories: [] };
    for (const item of memory.memories || []) {
      items.push(contextItem({
        scope: item.scope || "memory",
        source: "MemoryCore",
        taskType: item.taskType || taskType,
        content: item.content || item.concept || item.result || "",
        tags: item.tags || [],
        confidence: item.retrievalScore || item.confidence || 0.75
      }));
    }

    const knowledge = this.knowledgeRetriever.retrieve?.({ task: input, taskType }) || {};
    for (const tool of knowledge.recommendedTools || []) {
      items.push(contextItem({
        scope: "knowledge",
        source: "KnowledgeRetriever",
        taskType,
        content: `recommendedTool=${tool}`,
        tags: ["tool", tool],
        confidence: knowledge.successRate || 0.75
      }));
    }

    for (const goal of this.goalManager.listGoals?.() || []) {
      if (taskType && goal.taskType && goal.taskType !== taskType) continue;
      items.push(contextItem({
        scope: "goal",
        source: "GoalManager",
        taskType: goal.taskType || taskType,
        content: goal.goal || goal.sourceInput || goal.intent || "",
        tags: ["goal", goal.status].filter(Boolean),
        confidence: goal.confidence || 0.75,
        critical: goal.status === "active"
      }));
    }

    for (const skill of this.skillRegistry.query?.({ taskType, keyword: input }) || []) {
      items.push(contextItem({
        scope: "skill",
        source: "SkillRegistry",
        taskType: (skill.taskTypes || [])[0] || taskType,
        content: `${skill.name || skill.skillId}: ${skill.description || skill.status || ""}`,
        tags: ["skill", ...(skill.capabilities || [])],
        confidence: skill.status === "installed" || skill.status === "registered" ? 0.82 : 0.5
      }));
    }

    const workflows = Object.values(this.workflowEngine.load?.().workflows || {});
    for (const workflow of workflows) {
      if (taskType && workflow.taskType && workflow.taskType !== taskType) continue;
      items.push(contextItem({
        scope: "workflow",
        source: "WorkflowEngine",
        taskType: workflow.taskType || taskType,
        content: `${workflow.status || "workflow"}:${workflow.workflowId || ""}`,
        tags: ["workflow", workflow.status].filter(Boolean),
        confidence: workflow.status === "running" ? 0.84 : 0.65,
        critical: workflow.status === "running"
      }));
    }

    const reflectionHints = this.reflectionMemory.getHints?.({ taskType }) || {};
    if (reflectionHints.available) {
      items.push(contextItem({
        scope: "reflection",
        source: "ReflectionMemory",
        taskType,
        content: reflectionHints.suggestion,
        tags: ["reflection"],
        confidence: reflectionHints.confidence || 0.75
      }));
    }

    const result = {
      input,
      taskType,
      agentId,
      items,
      counts: this.countByScope(items),
      updatedAt: nowIso(),
      safety: this.safety()
    };
    this.writeJson(this.filePath, { counts: result.counts, updatedAt: result.updatedAt, safety: result.safety });
    return result;
  }

  countByScope(items = []) {
    return items.reduce((acc, item) => {
      acc[item.scope] = (acc[item.scope] || 0) + 1;
      return acc;
    }, {});
  }

  safety() {
    return {
      contextOnly: true,
      executesTool: false,
      bypassesToolSelector: false,
      bypassesVerifierCenter: false
    };
  }

  ensureStore() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.filePath)) this.writeJson(this.filePath, { counts: {}, updatedAt: null, safety: this.safety() });
  }

  writeJson(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  }
}

module.exports = { ContextBuilder };
