const { KnowledgeCenter } = require("../knowledge/knowledge-center");
const { ExperienceCenter } = require("../experience/experience-center");
const { ReflectionMemory } = require("../reflection/reflection-memory");
const { LearningOrchestrator } = require("../learning/learning-orchestrator");
const { SelfImprovementEngine } = require("../self-improvement/self-improvement-engine");
const { AgentEvolutionEngine } = require("../evolution/agent-evolution-engine");
const { EvolutionGraph, DEFAULT_EVOLUTION_NETWORK_ROOT } = require("./evolution-graph");
const { KnowledgeFlowManager } = require("./knowledge-flow-manager");
const { KnowledgeImpactAnalyzer } = require("./knowledge-impact-analyzer");

function list(value) {
  return Array.isArray(value) ? value : [];
}

class KnowledgeEvolutionNetwork {
  constructor({
    rootDir = DEFAULT_EVOLUTION_NETWORK_ROOT,
    knowledgeCenter = null,
    experienceCenter = null,
    reflectionMemory = null,
    learningOrchestrator = null,
    selfImprovementEngine = null,
    evolutionEngine = null,
    evolutionGraph = null,
    flowManager = null,
    impactAnalyzer = null
  } = {}) {
    this.rootDir = rootDir;
    this.knowledgeCenter = knowledgeCenter || new KnowledgeCenter();
    this.experienceCenter = experienceCenter || new ExperienceCenter({ knowledgeCenter: this.knowledgeCenter });
    this.reflectionMemory = reflectionMemory || new ReflectionMemory();
    this.learningOrchestrator = learningOrchestrator || new LearningOrchestrator();
    this.selfImprovementEngine = selfImprovementEngine || new SelfImprovementEngine();
    this.evolutionEngine = evolutionEngine || new AgentEvolutionEngine();
    this.evolutionGraph = evolutionGraph || new EvolutionGraph({ rootDir });
    this.flowManager = flowManager || new KnowledgeFlowManager({ rootDir });
    this.impactAnalyzer = impactAnalyzer || new KnowledgeImpactAnalyzer({ rootDir });
  }

  evolve({ taskType = "", before = {}, after = {} } = {}) {
    const knowledge = this.safeCall(() => this.knowledgeCenter.queryKnowledge({ taskType }), []);
    const experience = this.safeCall(() => this.experienceCenter.list(), []).filter((item) => !taskType || item.taskType === taskType);
    const reflection = this.safeCall(() => this.reflectionMemory.loadReflections().reflections, []).filter((item) => !taskType || item.taskType === taskType);
    const learning = this.safeCall(() => this.learningOrchestrator.getHints({ taskType }), { hints: [] });
    const improvement = this.safeCall(() => this.selfImprovementEngine.getHints({ taskType }), { hints: [] });
    const evolution = this.safeCall(() => this.evolutionEngine.generateEvolutionAdvice({ taskType }), { recommendations: [] });
    const knowledgeEvolutionGraph = this.evolutionGraph.build({
      knowledge,
      experience,
      reflection,
      learning,
      evolution,
      taskType
    });
    const flow = this.flowManager.mapFlows({ experience, reflection, learning, evolution, taskType });
    const knowledgeImpact = this.impactAnalyzer.analyze({
      before,
      after,
      graph: knowledgeEvolutionGraph,
      flows: flow,
      taskType
    });
    const knowledgeUpdates = this.buildUpdates({ knowledge, experience, reflection, learning, improvement, evolution, flow });
    return {
      taskType,
      knowledgeEvolutionGraph,
      knowledgeUpdates,
      knowledgeImpact,
      flow,
      learning,
      improvement,
      evolution,
      safety: this.safety()
    };
  }

  getHints({ taskType = "" } = {}) {
    const result = this.evolve({ taskType });
    const hints = [];
    if (result.knowledgeImpact.status === "positive") {
      hints.push({ type: "positive_knowledge_impact", suggestion: "prefer knowledge paths with positive impact", advisoryOnly: true });
    }
    if (result.flow.flowCount > 0) {
      hints.push({ type: "knowledge_flow", suggestion: "reuse connected experience/reflection/learning/evolution flows", advisoryOnly: true });
    }
    if (result.knowledgeEvolutionGraph.nodes.length > 0) {
      hints.push({ type: "knowledge_graph", suggestion: "consider related task-experience-strategy-skill-capability graph", advisoryOnly: true });
    }
    return {
      available: hints.length > 0,
      taskType,
      hints,
      knowledgeUpdates: result.knowledgeUpdates,
      knowledgeImpact: result.knowledgeImpact,
      graphSummary: {
        nodes: result.knowledgeEvolutionGraph.nodes.length,
        edges: result.knowledgeEvolutionGraph.edges.length
      },
      safety: this.safety()
    };
  }

  buildUpdates({ knowledge = [], experience = [], reflection = [], learning = {}, improvement = {}, evolution = {}, flow = {} } = {}) {
    return {
      knowledgeCount: list(knowledge).length,
      experienceCount: list(experience).length,
      reflectionCount: list(reflection).length,
      learningHintCount: list(learning.hints || learning.learningHints).length,
      improvementHintCount: list(improvement.hints).length,
      evolutionRecommendationCount: list(evolution.recommendations).length,
      flowCount: flow.flowCount || 0
    };
  }

  safeCall(fn, fallback) {
    try {
      return fn();
    } catch {
      return fallback;
    }
  }

  safety() {
    return {
      evolutionNetworkOnly: true,
      advisoryOnly: true,
      executesTool: false,
      modifiesPermission: false,
      bypassesToolSelector: false,
      bypassesVerifierCenter: false
    };
  }
}

module.exports = { KnowledgeEvolutionNetwork, DEFAULT_EVOLUTION_NETWORK_ROOT };
