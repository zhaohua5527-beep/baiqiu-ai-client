const fs = require("node:fs");
const path = require("node:path");
const { DecisionManager } = require("../decision-intelligence/decision-manager");
const { AttentionManager } = require("../attention/attention-manager");
const { ContextManager } = require("../context-management/context-manager");
const { MemoryCore } = require("../memory-architecture/memory-core");
const { GoalManager } = require("../goal/goal-manager");
const { ReasoningEngine } = require("../reasoning/reasoning-engine");
const { ReflectionMemory } = require("../reflection/reflection-memory");
const { AgentEvolutionEngine } = require("../evolution/agent-evolution-engine");
const { StrategyPlanner } = require("./strategy-planner");
const { StrategyEvaluator } = require("./strategy-evaluator");
const { StrategyEngine } = require("./strategy-engine");
const { StrategyMemory, DEFAULT_STRATEGY_ROOT } = require("./strategy-memory");

function nowIso() {
  return new Date().toISOString();
}

class StrategyManager {
  constructor({
    rootDir = DEFAULT_STRATEGY_ROOT,
    decisionManager = null,
    attentionManager = null,
    contextManager = null,
    memoryCore = null,
    goalManager = null,
    reasoningEngine = null,
    reflectionMemory = null,
    evolutionEngine = null,
    strategyPlanner = null,
    evaluator = null,
    strategyEngine = null,
    strategyMemory = null
  } = {}) {
    this.rootDir = rootDir;
    this.filePath = path.join(rootDir, "strategy-manager.json");
    this.decisionManager = decisionManager || new DecisionManager();
    this.attentionManager = attentionManager || new AttentionManager();
    this.contextManager = contextManager || new ContextManager();
    this.memoryCore = memoryCore || new MemoryCore();
    this.goalManager = goalManager || new GoalManager();
    this.reasoningEngine = reasoningEngine || new ReasoningEngine();
    this.reflectionMemory = reflectionMemory || new ReflectionMemory();
    this.evolutionEngine = evolutionEngine || new AgentEvolutionEngine();
    this.strategyPlanner = strategyPlanner || new StrategyPlanner({ rootDir });
    this.evaluator = evaluator || new StrategyEvaluator({ rootDir });
    this.strategyEngine = strategyEngine || new StrategyEngine({ rootDir, evaluator: this.evaluator });
    this.strategyMemory = strategyMemory || new StrategyMemory({ rootDir });
    this.ensureStore();
  }

  analyzeStrategy({ input = "", taskType = "", agentId = "default-agent", activeContext = [] } = {}) {
    const decision = this.decisionManager.analyzeDecision?.({ input, taskType, agentId, activeContext }) || null;
    const attention = this.attentionManager.focus?.({ input, taskType, agentId, activeContext }) || null;
    const context = this.contextManager.buildContext?.({ input, taskType, agentId, activeContext }) || this.contextManager.getLatestContext?.();
    const memory = this.memoryCore.retrieve?.({ keyword: input, taskType, limit: 10 }) || { memories: [] };
    const goals = (this.goalManager.listGoals?.() || []).filter((goal) => !taskType || !goal.taskType || goal.taskType === taskType);
    const reasoning = this.reasoningEngine.reason?.({ goal: input, taskType, knowledgeHints: {}, historicalExperience: [] }) || null;
    const reflection = this.reflectionMemory.getHints?.({ taskType }) || {};
    const evolution = this.evolutionEngine.generateEvolutionAdvice?.({ agentId, taskType }) || null;
    const strategies = this.strategyPlanner.plan({
      decision,
      attention,
      context,
      memory,
      goals,
      reasoning,
      reflection,
      evolution,
      taskType
    });
    const analysis = this.strategyEngine.select({ strategies, context: { input, taskType, agentId } });
    const memoryRecord = this.strategyMemory.record({
      strategyId: analysis.strategyAnalysisId,
      input,
      taskType,
      selectedStrategy: analysis.selectedStrategy,
      alternatives: analysis.alternatives,
      score: analysis.score,
      reason: analysis.reason
    });
    const result = {
      strategyAnalysisId: analysis.strategyAnalysisId,
      input,
      taskType,
      agentId,
      strategyCount: strategies.length,
      analysis,
      memory: memoryRecord,
      connectedSystems: ["Decision", "Attention", "Context", "Memory", "Goal", "Reasoning", "Reflection", "Evolution"],
      timestamp: nowIso(),
      safety: this.safety()
    };
    this.writeJson(this.filePath, {
      strategyAnalysisId: result.strategyAnalysisId,
      strategyCount: result.strategyCount,
      connectedSystems: result.connectedSystems,
      selectedStrategyId: analysis.selectedStrategy?.strategyId || "",
      score: analysis.score,
      updatedAt: result.timestamp,
      safety: result.safety
    });
    return result;
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
    if (!fs.existsSync(this.filePath)) this.writeJson(this.filePath, { strategyCount: 0, connectedSystems: [], safety: this.safety() });
  }

  writeJson(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  }
}

module.exports = { StrategyManager, DEFAULT_STRATEGY_ROOT };
