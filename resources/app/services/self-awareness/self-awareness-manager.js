const fs = require("node:fs");
const path = require("node:path");
const { GoalIntelligenceManager } = require("../goal-intelligence/goal-intelligence-manager");
const { StrategyManager } = require("../strategy-intelligence/strategy-manager");
const { DecisionManager } = require("../decision-intelligence/decision-manager");
const { MemoryCore } = require("../memory-architecture/memory-core");
const { ReflectionMemory } = require("../reflection/reflection-memory");
const { AgentEvolutionEngine } = require("../evolution/agent-evolution-engine");
const { AgentStateMonitor } = require("./agent-state-monitor");
const { CapabilityAwareness } = require("./capability-awareness");
const { LimitationDetector } = require("./limitation-detector");
const { SelfAwarenessMemory, DEFAULT_SELF_AWARENESS_ROOT } = require("./self-awareness-memory");

function nowIso() {
  return new Date().toISOString();
}

class SelfAwarenessManager {
  constructor({
    rootDir = DEFAULT_SELF_AWARENESS_ROOT,
    goalIntelligenceManager = null,
    strategyManager = null,
    decisionManager = null,
    memoryCore = null,
    reflectionMemory = null,
    evolutionEngine = null,
    stateMonitor = null,
    capabilityAwareness = null,
    limitationDetector = null,
    selfAwarenessMemory = null
  } = {}) {
    this.rootDir = rootDir;
    this.filePath = path.join(rootDir, "self-awareness-manager.json");
    this.goalIntelligenceManager = goalIntelligenceManager || new GoalIntelligenceManager();
    this.strategyManager = strategyManager || new StrategyManager();
    this.decisionManager = decisionManager || new DecisionManager();
    this.memoryCore = memoryCore || new MemoryCore();
    this.reflectionMemory = reflectionMemory || new ReflectionMemory();
    this.evolutionEngine = evolutionEngine || new AgentEvolutionEngine();
    this.stateMonitor = stateMonitor || new AgentStateMonitor({ rootDir });
    this.capabilityAwareness = capabilityAwareness || new CapabilityAwareness({ rootDir });
    this.limitationDetector = limitationDetector || new LimitationDetector({ rootDir });
    this.selfAwarenessMemory = selfAwarenessMemory || new SelfAwarenessMemory({ rootDir });
    this.ensureStore();
  }

  assessSelf({ input = "", taskType = "", agentId = "default-agent", activeContext = [], requirements = [] } = {}) {
    const goal = this.goalIntelligenceManager.analyzeGoal?.({ input, taskType, agentId, activeContext }) || null;
    const strategy = this.strategyManager.analyzeStrategy?.({ input, taskType, agentId, activeContext }) || null;
    const decision = this.decisionManager.analyzeDecision?.({ input, taskType, agentId, activeContext }) || null;
    const memory = this.memoryCore.retrieve?.({ keyword: input, taskType, limit: 10 }) || { memories: [] };
    const reflection = this.reflectionMemory.getHints?.({ taskType }) || {};
    const evolution = this.evolutionEngine.generateEvolutionAdvice?.({ agentId, taskType }) || null;
    const capability = this.capabilityAwareness.assess({ taskType, requirements });
    const state = this.stateMonitor.observe({ goal, strategy, decision, memory, reflection, evolution });
    const limitations = this.limitationDetector.detect({ state, capability, goal, strategy, decision, reflection, evolution });
    const summary = this.summarize({ state, capability, limitations });
    const memoryRecord = this.selfAwarenessMemory.record({
      awarenessId: state.stateId,
      agentId,
      taskType,
      state,
      capability,
      limitations: limitations.limitations,
      summary
    });
    const result = {
      awarenessId: state.stateId,
      agentId,
      taskType,
      state,
      capability,
      limitations,
      memory: memoryRecord,
      summary,
      connectedSystems: ["Goal", "Strategy", "Decision", "Memory", "Reflection", "Evolution"],
      timestamp: nowIso(),
      safety: this.safety()
    };
    this.writeJson(this.filePath, {
      awarenessId: result.awarenessId,
      status: state.status,
      summary,
      connectedSystems: result.connectedSystems,
      updatedAt: result.timestamp,
      safety: result.safety
    });
    return result;
  }

  summarize({ state = {}, capability = {}, limitations = {} } = {}) {
    if (limitations.hasLimitation) return `state=${state.status}; limitation=${limitations.highestSeverity}`;
    if (capability.ready === false) return "capability missing";
    return `state=${state.status}; capability_ready=${capability.ready !== false}`;
  }

  safety() {
    return {
      selfAwarenessOnly: true,
      executesTool: false,
      bypassesToolSelector: false,
      bypassesVerifierCenter: false
    };
  }

  ensureStore() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.filePath)) this.writeJson(this.filePath, { status: "idle", connectedSystems: [], safety: this.safety() });
  }

  writeJson(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  }
}

module.exports = { SelfAwarenessManager, DEFAULT_SELF_AWARENESS_ROOT };
