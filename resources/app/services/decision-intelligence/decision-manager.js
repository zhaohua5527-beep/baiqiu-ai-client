const fs = require("node:fs");
const path = require("node:path");
const { AttentionManager } = require("../attention/attention-manager");
const { ContextManager } = require("../context-management/context-manager");
const { MemoryCore } = require("../memory-architecture/memory-core");
const { GoalManager } = require("../goal/goal-manager");
const { ReasoningEngine } = require("../reasoning/reasoning-engine");
const { ReflectionMemory } = require("../reflection/reflection-memory");
const { AgentEvolutionEngine } = require("../evolution/agent-evolution-engine");
const { OptionGenerator } = require("./option-generator");
const { DecisionEvaluator } = require("./decision-evaluator");
const { DecisionEngine } = require("./decision-engine");
const { DecisionMemory, DEFAULT_DECISION_ROOT } = require("./decision-memory");

function nowIso() {
  return new Date().toISOString();
}

class DecisionManager {
  constructor({
    rootDir = DEFAULT_DECISION_ROOT,
    attentionManager = null,
    contextManager = null,
    memoryCore = null,
    goalManager = null,
    reasoningEngine = null,
    reflectionMemory = null,
    evolutionEngine = null,
    optionGenerator = null,
    evaluator = null,
    decisionEngine = null,
    decisionMemory = null
  } = {}) {
    this.rootDir = rootDir;
    this.filePath = path.join(rootDir, "decision-manager.json");
    this.attentionManager = attentionManager || new AttentionManager();
    this.contextManager = contextManager || new ContextManager();
    this.memoryCore = memoryCore || new MemoryCore();
    this.goalManager = goalManager || new GoalManager();
    this.reasoningEngine = reasoningEngine || new ReasoningEngine();
    this.reflectionMemory = reflectionMemory || new ReflectionMemory();
    this.evolutionEngine = evolutionEngine || new AgentEvolutionEngine();
    this.optionGenerator = optionGenerator || new OptionGenerator({ rootDir });
    this.evaluator = evaluator || new DecisionEvaluator({ rootDir });
    this.decisionEngine = decisionEngine || new DecisionEngine({ rootDir, evaluator: this.evaluator });
    this.decisionMemory = decisionMemory || new DecisionMemory({ rootDir });
    this.ensureStore();
  }

  analyzeDecision({ input = "", taskType = "", agentId = "default-agent", activeContext = [] } = {}) {
    const attention = this.attentionManager.focus?.({ input, taskType, agentId, activeContext }) || null;
    const context = this.contextManager.buildContext?.({ input, taskType, agentId, activeContext }) || this.contextManager.getLatestContext?.();
    const memory = this.memoryCore.retrieve?.({ keyword: input, taskType, limit: 10 }) || { memories: [] };
    const goals = (this.goalManager.listGoals?.() || []).filter((goal) => !taskType || !goal.taskType || goal.taskType === taskType);
    const reasoning = this.reasoningEngine.reason?.({ goal: input, taskType, knowledgeHints: {}, historicalExperience: [] }) || null;
    const reflection = this.reflectionMemory.getHints?.({ taskType }) || {};
    const evolution = this.evolutionEngine.generateEvolutionAdvice?.({ agentId, taskType }) || null;
    const options = this.optionGenerator.generate({
      attention,
      context,
      memory,
      goals,
      reasoning,
      reflection,
      evolution,
      taskType
    });
    const decision = this.decisionEngine.decide({ options, context: { input, taskType, agentId } });
    const memoryRecord = this.decisionMemory.record({
      decisionId: decision.decisionId,
      input,
      taskType,
      selectedOption: decision.selectedOption,
      alternatives: decision.alternatives,
      score: decision.score,
      reason: decision.reason
    });
    const result = {
      decisionId: decision.decisionId,
      input,
      taskType,
      agentId,
      optionCount: options.length,
      decision,
      memory: memoryRecord,
      connectedSystems: ["Attention", "Context", "Memory", "Goal", "Reasoning", "Reflection", "Evolution"],
      timestamp: nowIso(),
      safety: this.safety()
    };
    this.writeJson(this.filePath, {
      decisionId: result.decisionId,
      optionCount: result.optionCount,
      connectedSystems: result.connectedSystems,
      selectedOptionId: decision.selectedOption?.optionId || "",
      score: decision.score,
      updatedAt: result.timestamp,
      safety: result.safety
    });
    return result;
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
    if (!fs.existsSync(this.filePath)) this.writeJson(this.filePath, { optionCount: 0, connectedSystems: [], safety: this.safety() });
  }

  writeJson(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  }
}

module.exports = { DecisionManager, DEFAULT_DECISION_ROOT };
