const fs = require("node:fs");
const path = require("node:path");
const { StrategyManager } = require("../strategy-intelligence/strategy-manager");
const { DecisionManager } = require("../decision-intelligence/decision-manager");
const { AttentionManager } = require("../attention/attention-manager");
const { ContextManager } = require("../context-management/context-manager");
const { MemoryCore } = require("../memory-architecture/memory-core");
const { GoalManager } = require("../goal/goal-manager");
const { ReasoningEngine } = require("../reasoning/reasoning-engine");
const { ReflectionMemory } = require("../reflection/reflection-memory");
const { AgentEvolutionEngine } = require("../evolution/agent-evolution-engine");
const { GoalPursuitEngine } = require("./goal-pursuit-engine");
const { GoalAdaptationEngine } = require("./goal-adaptation-engine");
const { GoalConflictResolver } = require("./goal-conflict-resolver");
const { GoalMemory, DEFAULT_GOAL_INTELLIGENCE_ROOT } = require("./goal-memory");

function nowIso() {
  return new Date().toISOString();
}

class GoalIntelligenceManager {
  constructor({
    rootDir = DEFAULT_GOAL_INTELLIGENCE_ROOT,
    strategyManager = null,
    decisionManager = null,
    attentionManager = null,
    contextManager = null,
    memoryCore = null,
    goalManager = null,
    reasoningEngine = null,
    reflectionMemory = null,
    evolutionEngine = null,
    pursuitEngine = null,
    adaptationEngine = null,
    conflictResolver = null,
    goalMemory = null
  } = {}) {
    this.rootDir = rootDir;
    this.filePath = path.join(rootDir, "goal-intelligence-manager.json");
    this.strategyManager = strategyManager || new StrategyManager();
    this.decisionManager = decisionManager || new DecisionManager();
    this.attentionManager = attentionManager || new AttentionManager();
    this.contextManager = contextManager || new ContextManager();
    this.memoryCore = memoryCore || new MemoryCore();
    this.goalManager = goalManager || new GoalManager();
    this.reasoningEngine = reasoningEngine || new ReasoningEngine();
    this.reflectionMemory = reflectionMemory || new ReflectionMemory();
    this.evolutionEngine = evolutionEngine || new AgentEvolutionEngine();
    this.pursuitEngine = pursuitEngine || new GoalPursuitEngine({ rootDir });
    this.adaptationEngine = adaptationEngine || new GoalAdaptationEngine({ rootDir });
    this.conflictResolver = conflictResolver || new GoalConflictResolver({ rootDir });
    this.goalMemory = goalMemory || new GoalMemory({ rootDir });
    this.ensureStore();
  }

  analyzeGoal({ input = "", taskType = "", agentId = "default-agent", activeContext = [] } = {}) {
    const strategy = this.strategyManager.analyzeStrategy?.({ input, taskType, agentId, activeContext }) || null;
    const decision = this.decisionManager.analyzeDecision?.({ input, taskType, agentId, activeContext }) || null;
    const attention = this.attentionManager.focus?.({ input, taskType, agentId, activeContext }) || null;
    const context = this.contextManager.buildContext?.({ input, taskType, agentId, activeContext }) || this.contextManager.getLatestContext?.();
    const memory = this.memoryCore.retrieve?.({ keyword: input, taskType, limit: 10 }) || { memories: [] };
    const goals = (this.goalManager.listGoals?.() || []).filter((goal) => !taskType || !goal.taskType || goal.taskType === taskType);
    const reasoning = this.reasoningEngine.reason?.({ goal: input, taskType, knowledgeHints: {}, historicalExperience: [] }) || null;
    const reflection = this.reflectionMemory.getHints?.({ taskType }) || {};
    const evolution = this.evolutionEngine.generateEvolutionAdvice?.({ agentId, taskType }) || null;
    const conflicts = this.conflictResolver.resolve(goals);
    const pursuit = this.pursuitEngine.pursue({ goals, strategy, decision, attention, reasoning });
    const adaptation = this.adaptationEngine.adapt({ pursuit, conflicts, reflection, evolution, memory, context });
    const score = Number(((pursuit.pursuitScore || 0) * 0.55 + (adaptation.confidence || 0) * 0.45).toFixed(4));
    const memoryRecord = this.goalMemory.record({
      goalIntelligenceId: pursuit.pursuitId,
      input,
      taskType,
      pursuit,
      adaptation,
      conflicts: conflicts.conflicts,
      recommendation: adaptation.recommendation,
      score
    });
    const result = {
      goalIntelligenceId: pursuit.pursuitId,
      input,
      taskType,
      agentId,
      pursuit,
      adaptation,
      conflicts,
      memory: memoryRecord,
      score,
      connectedSystems: ["Strategy", "Decision", "Attention", "Context", "Memory", "Reasoning", "Reflection", "Evolution"],
      timestamp: nowIso(),
      safety: this.safety()
    };
    this.writeJson(this.filePath, {
      goalIntelligenceId: result.goalIntelligenceId,
      score,
      recommendation: adaptation.recommendation,
      connectedSystems: result.connectedSystems,
      updatedAt: result.timestamp,
      safety: result.safety
    });
    return result;
  }

  safety() {
    return {
      goalIntelligenceOnly: true,
      executesTool: false,
      bypassesToolSelector: false,
      bypassesVerifierCenter: false
    };
  }

  ensureStore() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.filePath)) this.writeJson(this.filePath, { score: 0, connectedSystems: [], safety: this.safety() });
  }

  writeJson(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  }
}

module.exports = { GoalIntelligenceManager, DEFAULT_GOAL_INTELLIGENCE_ROOT };
