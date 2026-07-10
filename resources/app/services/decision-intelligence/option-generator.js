const fs = require("node:fs");
const path = require("node:path");
const { DEFAULT_DECISION_ROOT } = require("./decision-memory");

function nowIso() {
  return new Date().toISOString();
}

function option(input = {}) {
  return {
    optionId: input.optionId || `option-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    sourceType: input.sourceType || "analysis",
    source: input.source || "",
    taskType: input.taskType || "",
    action: input.action || "consider",
    content: String(input.content || "").slice(0, 2000),
    confidence: Number.isFinite(Number(input.confidence)) ? Number(input.confidence) : 0.6,
    attentionScore: Number(input.attentionScore || 0),
    reasoningScore: Number(input.reasoningScore || 0),
    riskLevel: input.riskLevel || "low",
    blocked: input.blocked === true,
    metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {},
    timestamp: input.timestamp || nowIso()
  };
}

class OptionGenerator {
  constructor({ rootDir = DEFAULT_DECISION_ROOT } = {}) {
    this.rootDir = rootDir;
    this.filePath = path.join(rootDir, "decision-options.json");
    this.ensureStore();
  }

  generate({ attention = null, context = null, memory = null, goals = [], reasoning = null, reflection = null, evolution = null, taskType = "" } = {}) {
    const options = [];
    for (const item of attention?.selection?.selected || []) {
      options.push(option({
        sourceType: "attention",
        source: item.source || "AttentionManager",
        taskType: item.taskType || taskType,
        action: "focus",
        content: item.content || item.reason || "",
        confidence: item.confidence || 0.75,
        attentionScore: item.attentionScore || 0
      }));
    }
    for (const item of context?.items || []) {
      options.push(option({
        sourceType: "context",
        source: item.source || "ContextManager",
        taskType: item.taskType || taskType,
        action: "use_context",
        content: item.content || "",
        confidence: item.priorityScore || item.confidence || 0.7
      }));
    }
    for (const item of memory?.memories || []) {
      options.push(option({
        sourceType: "memory",
        source: "MemoryCore",
        taskType: item.taskType || taskType,
        action: "use_memory",
        content: item.content || item.concept || item.result || "",
        confidence: item.retrievalScore || item.confidence || 0.7
      }));
    }
    for (const goal of goals || []) {
      options.push(option({
        sourceType: "goal",
        source: "GoalManager",
        taskType: goal.taskType || taskType,
        action: "prioritize_goal",
        content: goal.goal || goal.sourceInput || goal.intent || "",
        confidence: goal.confidence || 0.8,
        riskLevel: goal.riskLevel || "low",
        blocked: goal.status === "blocked",
        metadata: { status: goal.status, goalId: goal.goalId }
      }));
    }
    if (reasoning?.selectedPlan) {
      options.push(option({
        sourceType: "reasoning",
        source: "ReasoningEngine",
        taskType: reasoning.taskType || taskType,
        action: "select_strategy",
        content: reasoning.reason || reasoning.selectedPlan.id || "",
        confidence: reasoning.confidence || 0.75,
        reasoningScore: reasoning.confidence || 0,
        metadata: { selectedPlan: reasoning.selectedPlan }
      }));
    }
    if (reflection?.available) {
      options.push(option({
        sourceType: "reflection",
        source: "ReflectionMemory",
        taskType,
        action: "apply_reflection_hint",
        content: reflection.suggestion,
        confidence: reflection.confidence || 0.75
      }));
    }
    for (const item of evolution?.recommendations || []) {
      options.push(option({
        sourceType: "evolution",
        source: "AgentEvolutionEngine",
        taskType,
        action: "consider_evolution_advice",
        content: item.suggestion || item.type || "",
        confidence: item.confidence || 0.6,
        metadata: item
      }));
    }
    this.writeJson(this.filePath, {
      options: options.map((item) => ({ optionId: item.optionId, sourceType: item.sourceType, action: item.action })),
      updatedAt: nowIso(),
      safety: this.safety()
    });
    return options;
  }

  safety() {
    return {
      decisionAnalysisOnly: true,
      executesTool: false,
      bypassesToolSelector: false,
      bypassesVerifierCenter: false
    };
  }

  ensureStore() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.filePath)) this.writeJson(this.filePath, { options: [], updatedAt: null, safety: this.safety() });
  }

  writeJson(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  }
}

module.exports = { OptionGenerator };
