const fs = require("node:fs");
const path = require("node:path");
const { ContextManager } = require("../context-management/context-manager");
const { MemoryCore } = require("../memory-architecture/memory-core");
const { GoalManager } = require("../goal/goal-manager");
const { WorkflowEngine } = require("../workflow/workflow-engine");
const { ReflectionMemory } = require("../reflection/reflection-memory");
const { AgentEvolutionEngine } = require("../evolution/agent-evolution-engine");
const { AttentionSelector } = require("./attention-selector");
const { AttentionPriorityEngine, DEFAULT_ATTENTION_ROOT } = require("./attention-priority-engine");
const { AttentionMonitor } = require("./attention-monitor");
const { AttentionMemory } = require("./attention-memory");

function nowIso() {
  return new Date().toISOString();
}

function signal(input = {}) {
  return {
    attentionId: input.attentionId || `att-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    sourceType: input.sourceType || "context",
    source: input.source || "",
    type: input.type || input.sourceType || "attention",
    taskType: input.taskType || "",
    content: String(input.content || "").slice(0, 3000),
    reason: input.reason || "",
    tags: Array.isArray(input.tags) ? input.tags : [],
    confidence: Number.isFinite(Number(input.confidence)) ? Number(input.confidence) : 0.75,
    urgent: input.urgent === true,
    blocked: input.blocked === true,
    critical: input.critical === true,
    timestamp: input.timestamp || nowIso()
  };
}

class AttentionManager {
  constructor({
    rootDir = DEFAULT_ATTENTION_ROOT,
    contextManager = null,
    memoryCore = null,
    goalManager = null,
    workflowEngine = null,
    reflectionMemory = null,
    evolutionEngine = null,
    priorityEngine = null,
    selector = null,
    monitor = null,
    attentionMemory = null
  } = {}) {
    this.rootDir = rootDir;
    this.filePath = path.join(rootDir, "attention-manager.json");
    this.contextManager = contextManager || new ContextManager();
    this.memoryCore = memoryCore || new MemoryCore();
    this.goalManager = goalManager || new GoalManager();
    this.workflowEngine = workflowEngine || new WorkflowEngine();
    this.reflectionMemory = reflectionMemory || new ReflectionMemory();
    this.evolutionEngine = evolutionEngine || new AgentEvolutionEngine();
    this.priorityEngine = priorityEngine || new AttentionPriorityEngine({ rootDir });
    this.selector = selector || new AttentionSelector({ rootDir, priorityEngine: this.priorityEngine });
    this.monitor = monitor || new AttentionMonitor({ rootDir });
    this.attentionMemory = attentionMemory || new AttentionMemory({ rootDir });
    this.ensureStore();
  }

  collectSignals({ input = "", taskType = "", agentId = "default-agent", activeContext = [] } = {}) {
    const signals = [];

    const context = this.contextManager.buildContext?.({ input, taskType, agentId, activeContext }) || this.contextManager.getLatestContext?.();
    for (const item of context?.items || []) {
      signals.push(signal({
        sourceType: "context",
        source: item.source || "ContextManager",
        taskType: item.taskType || taskType,
        content: item.content || item.concept || "",
        tags: item.tags || [],
        confidence: item.priorityScore || item.confidence || 0.75,
        critical: item.critical === true
      }));
    }

    const memories = this.memoryCore.retrieve?.({ keyword: input, taskType, limit: 8 }).memories || [];
    for (const item of memories) {
      signals.push(signal({
        sourceType: "memory",
        source: "MemoryCore",
        taskType: item.taskType || taskType,
        content: item.content || item.concept || item.result || "",
        tags: item.tags || [],
        confidence: item.retrievalScore || item.confidence || 0.75
      }));
    }

    for (const goal of this.goalManager.listGoals?.() || []) {
      if (taskType && goal.taskType && goal.taskType !== taskType) continue;
      signals.push(signal({
        sourceType: "goal",
        source: "GoalManager",
        taskType: goal.taskType || taskType,
        content: goal.goal || goal.sourceInput || goal.intent || "",
        tags: ["goal", goal.status].filter(Boolean),
        confidence: goal.confidence || 0.8,
        urgent: goal.priorityScore >= 0.8,
        blocked: goal.status === "blocked",
        critical: goal.status === "active"
      }));
    }

    const workflows = Object.values(this.workflowEngine.load?.().workflows || {});
    for (const workflow of workflows) {
      if (taskType && workflow.taskType && workflow.taskType !== taskType) continue;
      signals.push(signal({
        sourceType: "workflow",
        source: "WorkflowEngine",
        taskType: workflow.taskType || taskType,
        content: `${workflow.status || "workflow"}:${workflow.workflowId || ""}`,
        tags: ["workflow", workflow.status].filter(Boolean),
        confidence: workflow.status === "running" ? 0.86 : 0.65,
        urgent: workflow.status === "blocked",
        blocked: workflow.status === "blocked",
        critical: workflow.status === "running"
      }));
    }

    const reflection = this.reflectionMemory.getHints?.({ taskType }) || {};
    if (reflection.available) {
      signals.push(signal({
        sourceType: "reflection",
        source: "ReflectionMemory",
        taskType,
        content: reflection.suggestion,
        tags: ["reflection"],
        confidence: reflection.confidence || 0.75
      }));
    }

    const evolution = this.evolutionEngine.generateEvolutionAdvice?.({ agentId, taskType }) || null;
    for (const item of evolution?.recommendations || []) {
      signals.push(signal({
        sourceType: "evolution",
        source: "AgentEvolutionEngine",
        taskType,
        content: item.suggestion || item.type || "",
        tags: ["evolution", item.type, item.target].filter(Boolean),
        confidence: item.confidence || 0.6
      }));
    }

    return signals;
  }

  focus({ input = "", taskType = "", agentId = "default-agent", activeContext = [], limit = 8 } = {}) {
    const signals = this.collectSignals({ input, taskType, agentId, activeContext });
    const selection = this.selector.select(signals, { input, taskType, limit });
    const memory = this.attentionMemory.remember(selection);
    const event = this.monitor.record({
      event: "attention.focus",
      status: selection.selected.length ? "focused" : "idle",
      focus: selection.focus,
      selectedCount: selection.selected.length,
      droppedCount: selection.dropped.length,
      warnings: selection.selected.length ? [] : ["no_attention_signal"]
    });
    const result = {
      attentionId: `attention-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      input,
      taskType,
      agentId,
      signals,
      selection,
      memory,
      event,
      updatedAt: nowIso(),
      safety: this.safety()
    };
    this.writeJson(this.filePath, {
      attentionId: result.attentionId,
      signalCount: signals.length,
      selectedCount: selection.selected.length,
      focus: selection.focus,
      updatedAt: result.updatedAt,
      safety: result.safety
    });
    return result;
  }

  safety() {
    return {
      attentionOnly: true,
      executesTool: false,
      bypassesToolSelector: false,
      bypassesVerifierCenter: false
    };
  }

  ensureStore() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.filePath)) this.writeJson(this.filePath, { signalCount: 0, selectedCount: 0, safety: this.safety() });
  }

  writeJson(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  }
}

module.exports = { AttentionManager, DEFAULT_ATTENTION_ROOT };
