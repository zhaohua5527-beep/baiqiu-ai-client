const fs = require("node:fs");
const path = require("node:path");
const { SelfAwarenessManager } = require("../self-awareness/self-awareness-manager");
const { ReflectionMemory } = require("../reflection/reflection-memory");
const { ExperienceCenter } = require("../experience/experience-center");
const { KnowledgeCenter } = require("../knowledge/knowledge-center");
const { PerformanceTracker } = require("../optimization/performance-tracker");
const { StrategyManager } = require("../strategy-intelligence/strategy-manager");
const { DecisionManager } = require("../decision-intelligence/decision-manager");
const { GoalIntelligenceManager } = require("../goal-intelligence/goal-intelligence-manager");
const { ImprovementAnalyzer } = require("./improvement-analyzer");
const { ImprovementPlanner } = require("./improvement-planner");
const { ImprovementEvaluator } = require("./improvement-evaluator");
const { ImprovementMemory, DEFAULT_SELF_IMPROVEMENT_ROOT } = require("./improvement-memory");

function nowIso() {
  return new Date().toISOString();
}

class SelfImprovementEngine {
  constructor({
    rootDir = DEFAULT_SELF_IMPROVEMENT_ROOT,
    selfAwarenessManager = null,
    reflectionMemory = null,
    experienceCenter = null,
    knowledgeCenter = null,
    performanceTracker = null,
    strategyManager = null,
    decisionManager = null,
    goalIntelligenceManager = null,
    analyzer = null,
    planner = null,
    evaluator = null,
    improvementMemory = null
  } = {}) {
    this.rootDir = rootDir;
    this.filePath = path.join(rootDir, "self-improvement-engine.json");
    this.selfAwarenessManager = selfAwarenessManager || new SelfAwarenessManager();
    this.reflectionMemory = reflectionMemory || new ReflectionMemory();
    this.experienceCenter = experienceCenter || new ExperienceCenter();
    this.knowledgeCenter = knowledgeCenter || new KnowledgeCenter();
    this.performanceTracker = performanceTracker || new PerformanceTracker();
    this.strategyManager = strategyManager || new StrategyManager();
    this.decisionManager = decisionManager || new DecisionManager();
    this.goalIntelligenceManager = goalIntelligenceManager || new GoalIntelligenceManager();
    this.analyzer = analyzer || new ImprovementAnalyzer({
      rootDir,
      reflectionMemory: this.reflectionMemory,
      experienceCenter: this.experienceCenter,
      performanceTracker: this.performanceTracker,
      knowledgeCenter: this.knowledgeCenter
    });
    this.planner = planner || new ImprovementPlanner({ rootDir });
    this.evaluator = evaluator || new ImprovementEvaluator({ rootDir });
    this.improvementMemory = improvementMemory || new ImprovementMemory({ rootDir });
    this.ensureStore();
  }

  collectTaskResult(input = {}) {
    return {
      taskType: input.taskType || "",
      executionResult: input.executionResult || null,
      verificationResult: input.verificationResult || null,
      duration: Number(input.duration || 0),
      success: input.success === true || input.executionResult?.success === true,
      timestamp: input.timestamp || nowIso()
    };
  }

  generateImprovementHints({ input = "", taskType = "", executionResult = null, before = null, after = null, agentId = "default-agent" } = {}) {
    const taskResult = this.collectTaskResult({ taskType, executionResult });
    const selfAwareness = this.safeCall(() => this.selfAwarenessManager.assessSelf?.({ input, taskType, agentId }), null);
    const strategy = this.safeCall(() => this.strategyManager.analyzeStrategy?.({ input, taskType, agentId }), null);
    const decision = this.safeCall(() => this.decisionManager.analyzeDecision?.({ input, taskType, agentId }), null);
    const goal = this.safeCall(() => this.goalIntelligenceManager.analyzeGoal?.({ input, taskType, agentId }), null);
    const analysis = this.analyzer.analyze({ taskType, executionResult: taskResult });
    analysis.connectedSystems = ["Self Awareness", "Reflection", "Experience", "Knowledge", "PerformanceTracker", "Strategy Intelligence", "Decision Intelligence", "Goal Intelligence"];
    analysis.selfAwarenessSummary = selfAwareness?.summary || "";
    analysis.strategyScore = Number(strategy?.analysis?.score || 0);
    analysis.decisionScore = Number(decision?.decision?.score || 0);
    analysis.goalScore = Number(goal?.score || 0);
    const plan = this.planner.plan(analysis);
    const evaluation = this.evaluator.evaluate({ before, after, analysis, plan });
    const improvementHints = {
      available: plan.hints.length > 0,
      taskType,
      hints: plan.hints,
      strategyImprove: plan.strategyImprove,
      planningImprove: plan.planningImprove,
      toolSelectionImprove: plan.toolSelectionImprove,
      memoryImprove: plan.memoryImprove,
      evaluation,
      safety: this.safety()
    };
    const memory = this.improvementMemory.record({
      taskType,
      input,
      analysis,
      plan,
      evaluation,
      improvementHints
    });
    const result = {
      improvementId: memory.improvementId,
      taskResult,
      analysis,
      plan,
      evaluation,
      improvementHints,
      memory,
      timestamp: nowIso(),
      safety: this.safety()
    };
    this.writeJson(this.filePath, {
      improvementId: result.improvementId,
      hintCount: plan.hints.length,
      connectedSystems: analysis.connectedSystems,
      updatedAt: result.timestamp,
      safety: result.safety
    });
    return result;
  }

  getHints({ taskType = "" } = {}) {
    return this.improvementMemory.getHints({ taskType });
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
      selfImprovementOnly: true,
      advisoryOnly: true,
      modifiesPermission: false,
      executesTool: false,
      bypassesToolSelector: false,
      bypassesVerifierCenter: false
    };
  }

  ensureStore() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.filePath)) this.writeJson(this.filePath, { hintCount: 0, safety: this.safety() });
  }

  writeJson(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  }
}

module.exports = { SelfImprovementEngine, DEFAULT_SELF_IMPROVEMENT_ROOT };
