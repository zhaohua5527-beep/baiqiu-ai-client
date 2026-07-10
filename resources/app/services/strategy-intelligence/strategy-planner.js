const fs = require("node:fs");
const path = require("node:path");
const { DEFAULT_STRATEGY_ROOT } = require("./strategy-memory");

function nowIso() {
  return new Date().toISOString();
}

function makeStrategy(input = {}) {
  return {
    strategyId: input.strategyId || `strategy-option-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    sourceType: input.sourceType || "analysis",
    source: input.source || "",
    taskType: input.taskType || "",
    strategy: input.strategy || "analyze",
    content: String(input.content || "").slice(0, 2000),
    confidence: Number.isFinite(Number(input.confidence)) ? Number(input.confidence) : 0.6,
    decisionScore: Number(input.decisionScore || 0),
    attentionScore: Number(input.attentionScore || 0),
    reasoningScore: Number(input.reasoningScore || 0),
    reflectionScore: Number(input.reflectionScore || 0),
    evolutionScore: Number(input.evolutionScore || 0),
    riskLevel: input.riskLevel || "low",
    blocked: input.blocked === true,
    metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {},
    timestamp: input.timestamp || nowIso()
  };
}

class StrategyPlanner {
  constructor({ rootDir = DEFAULT_STRATEGY_ROOT } = {}) {
    this.rootDir = rootDir;
    this.filePath = path.join(rootDir, "strategy-plans.json");
    this.ensureStore();
  }

  plan({ decision = null, attention = null, context = null, memory = null, goals = [], reasoning = null, reflection = null, evolution = null, taskType = "" } = {}) {
    const strategies = [];
    const selectedDecision = decision?.decision?.selectedOption || decision?.selectedOption;
    if (selectedDecision) {
      strategies.push(makeStrategy({
        sourceType: "decision",
        source: "DecisionManager",
        taskType: selectedDecision.taskType || taskType,
        strategy: `follow_${selectedDecision.action || "decision"}`,
        content: selectedDecision.content || "",
        confidence: selectedDecision.confidence || 0.75,
        decisionScore: decision.decision?.score || decision.score || 0,
        riskLevel: selectedDecision.riskLevel || "low",
        blocked: selectedDecision.blocked === true,
        metadata: { selectedDecision }
      }));
    }
    for (const item of attention?.selection?.selected || []) {
      strategies.push(makeStrategy({
        sourceType: "attention",
        source: "AttentionManager",
        taskType: item.taskType || taskType,
        strategy: "focus_priority_signal",
        content: item.content || item.reason || "",
        confidence: item.confidence || 0.7,
        attentionScore: item.attentionScore || 0
      }));
    }
    for (const item of context?.items || []) {
      strategies.push(makeStrategy({
        sourceType: "context",
        source: "ContextManager",
        taskType: item.taskType || taskType,
        strategy: "use_context_window",
        content: item.content || "",
        confidence: item.priorityScore || item.confidence || 0.65
      }));
    }
    for (const item of memory?.memories || []) {
      strategies.push(makeStrategy({
        sourceType: "memory",
        source: "MemoryCore",
        taskType: item.taskType || taskType,
        strategy: "reuse_memory_signal",
        content: item.content || item.concept || item.result || "",
        confidence: item.retrievalScore || item.confidence || 0.65
      }));
    }
    for (const goal of goals || []) {
      strategies.push(makeStrategy({
        sourceType: "goal",
        source: "GoalManager",
        taskType: goal.taskType || taskType,
        strategy: "prioritize_goal_strategy",
        content: goal.goal || goal.sourceInput || goal.intent || "",
        confidence: goal.confidence || 0.75,
        riskLevel: goal.riskLevel || "low",
        blocked: goal.status === "blocked"
      }));
    }
    if (reasoning?.selectedPlan) {
      strategies.push(makeStrategy({
        sourceType: "reasoning",
        source: "ReasoningEngine",
        taskType: reasoning.taskType || taskType,
        strategy: "use_reasoned_plan",
        content: reasoning.reason || reasoning.selectedPlan.id || "",
        confidence: reasoning.confidence || 0.8,
        reasoningScore: reasoning.confidence || 0,
        metadata: { selectedPlan: reasoning.selectedPlan }
      }));
    }
    if (reflection?.available) {
      strategies.push(makeStrategy({
        sourceType: "reflection",
        source: "ReflectionMemory",
        taskType,
        strategy: "apply_reflection_strategy",
        content: reflection.suggestion,
        confidence: reflection.confidence || 0.75,
        reflectionScore: reflection.confidence || 0
      }));
    }
    for (const item of evolution?.recommendations || []) {
      strategies.push(makeStrategy({
        sourceType: "evolution",
        source: "AgentEvolutionEngine",
        taskType,
        strategy: "consider_evolution_strategy",
        content: item.suggestion || item.type || "",
        confidence: item.confidence || 0.6,
        evolutionScore: item.confidence || 0,
        metadata: item
      }));
    }
    this.writeJson(this.filePath, {
      strategies: strategies.map((item) => ({ strategyId: item.strategyId, sourceType: item.sourceType, strategy: item.strategy })),
      updatedAt: nowIso(),
      safety: this.safety()
    });
    return strategies;
  }

  safety() {
    return {
      strategyAnalysisOnly: true,
      executesTool: false,
      bypassesToolSelector: false,
      bypassesVerifierCenter: false
    };
  }

  ensureStore() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.filePath)) this.writeJson(this.filePath, { strategies: [], safety: this.safety() });
  }

  writeJson(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  }
}

module.exports = { StrategyPlanner };
