const fs = require("node:fs");
const path = require("node:path");
const { ExperienceCenter } = require("../experience/experience-center");
const { KnowledgeCenter } = require("../knowledge/knowledge-center");
const { ReflectionEngine } = require("../reflection/reflection-engine");
const { ReflectionMemory } = require("../reflection/reflection-memory");
const { MetaLearningCenter } = require("../meta-learning/meta-learning-center");
const { SelfImprovementEngine } = require("../self-improvement/self-improvement-engine");
const { AgentEvolutionEngine } = require("../evolution/agent-evolution-engine");
const { PerformanceTracker } = require("../optimization/performance-tracker");
const { DEFAULT_LEARNING_ROOT } = require("./learning-priority-engine");
const { LearningScheduler } = require("./learning-scheduler");
const { LearningPriorityEngine } = require("./learning-priority-engine");
const { LearningEvaluator } = require("./learning-evaluator");

function nowIso() {
  return new Date().toISOString();
}

function safeList(value) {
  return Array.isArray(value) ? value : [];
}

class LearningOrchestrator {
  constructor({
    rootDir = DEFAULT_LEARNING_ROOT,
    experienceCenter = null,
    knowledgeCenter = null,
    reflectionEngine = null,
    reflectionMemory = null,
    metaLearningCenter = null,
    selfImprovementEngine = null,
    evolutionEngine = null,
    performanceTracker = null,
    scheduler = null,
    priorityEngine = null,
    evaluator = null
  } = {}) {
    this.rootDir = rootDir;
    this.planFile = path.join(rootDir, "learning-plan.json");
    this.experienceCenter = experienceCenter || new ExperienceCenter();
    this.knowledgeCenter = knowledgeCenter || new KnowledgeCenter();
    this.reflectionMemory = reflectionMemory || new ReflectionMemory();
    this.reflectionEngine = reflectionEngine || new ReflectionEngine({ reflectionMemory: this.reflectionMemory });
    this.metaLearningCenter = metaLearningCenter || new MetaLearningCenter();
    this.selfImprovementEngine = selfImprovementEngine || new SelfImprovementEngine();
    this.evolutionEngine = evolutionEngine || new AgentEvolutionEngine();
    this.performanceTracker = performanceTracker || new PerformanceTracker();
    this.priorityEngine = priorityEngine || new LearningPriorityEngine({ rootDir });
    this.scheduler = scheduler || new LearningScheduler({ rootDir, priorityEngine: this.priorityEngine });
    this.evaluator = evaluator || new LearningEvaluator({ rootDir });
    this.ensureStore();
  }

  buildLearningPlan(input = {}) {
    const taskType = input.taskType || "";
    const metrics = this.collectMetrics(taskType, input);
    const signals = this.detectSignals(metrics, input);
    const learningTasks = this.scheduler.schedule({
      taskType,
      metrics,
      signals,
      taskImportance: input.taskImportance,
      eventType: input.eventType,
      force: input.force === true
    });
    const learningHints = this.buildHints({ taskType, metrics, signals, learningTasks });
    const learningPlan = {
      learningPlanId: `learning-plan-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      taskType,
      learningTasks,
      learningHints,
      sources: ["Experience Center", "Knowledge Center", "Reflection Engine", "Meta Learning", "Self Improvement", "Evolution System"],
      metrics,
      signals,
      safety: this.safety(),
      timestamp: nowIso()
    };
    const evaluation = this.evaluator.evaluate({
      before: input.before || metrics.before || {},
      after: input.after || metrics.after || {},
      learningPlan
    });
    learningPlan.evaluation = evaluation;
    this.writeJson(this.planFile, learningPlan);
    return { learningPlan, learningTasks, learningHints, evaluation, safety: this.safety() };
  }

  getHints({ taskType = "" } = {}) {
    const plan = this.buildLearningPlan({ taskType, force: false });
    return {
      available: plan.learningHints.length > 0,
      taskType,
      hints: plan.learningHints,
      learningTasks: plan.learningTasks,
      evaluation: plan.evaluation,
      safety: this.safety()
    };
  }

  collectMetrics(taskType = "", input = {}) {
    const experiences = this.safeCall(() => this.experienceCenter.list(), []);
    const knowledge = this.safeCall(() => this.knowledgeCenter.queryKnowledge({ taskType }), []);
    const reflections = this.safeCall(() => this.reflectionMemory.loadReflections().reflections, []);
    const performance = this.safeCall(() => this.performanceTracker.list(), []);
    const metaHints = this.safeCall(() => this.metaLearningCenter.getHints({ taskType }), { available: false });
    const improvementHints = this.safeCall(() => this.selfImprovementEngine.getHints({ taskType }), { available: false });
    const evolutionAdvice = this.safeCall(() => this.evolutionEngine.generateEvolutionAdvice({ taskType }), null);
    const scopedPerformance = safeList(performance).filter((item) => !taskType || item.taskType === taskType);
    const scopedReflections = safeList(reflections).filter((item) => !taskType || item.taskType === taskType);
    const scopedExperiences = safeList(experiences).filter((item) => !taskType || item.taskType === taskType);
    const failCount = scopedPerformance.reduce((sum, item) => sum + Number(item.failCount || 0), 0);
    const sampleCount = scopedPerformance.reduce((sum, item) => sum + Number(item.sampleCount || 0), 0);
    const successCount = scopedPerformance.reduce((sum, item) => sum + Number(item.successCount || 0), 0);
    const avgDuration = scopedPerformance.length
      ? scopedPerformance.reduce((sum, item) => sum + Number(item.avgDuration || 0), 0) / scopedPerformance.length
      : 0;
    const successRate = sampleCount ? successCount / sampleCount : Number(input.successRate || 0);
    return {
      taskType,
      experienceCount: scopedExperiences.length,
      knowledgeCount: safeList(knowledge).length,
      reflectionCount: scopedReflections.length,
      performanceCount: scopedPerformance.length,
      failCount,
      successCount,
      sampleCount,
      avgDuration,
      successRate,
      before: input.before || { successRate, avgDuration, recoveryCount: scopedExperiences.length },
      after: input.after || { successRate, avgDuration, recoveryCount: scopedExperiences.length },
      metaHints,
      improvementHints,
      evolutionAdvice
    };
  }

  detectSignals(metrics = {}, input = {}) {
    const successRate = Number(metrics.successRate || 0);
    const failureRate = metrics.sampleCount ? Number(metrics.failCount || 0) / Number(metrics.sampleCount || 1) : Number(input.failureRate || 0);
    const previousSuccessRate = Number(input.previousSuccessRate ?? successRate);
    const successRateDrop = Math.max(0, previousSuccessRate - successRate);
    const previousAvgDuration = Number(input.previousAvgDuration ?? metrics.avgDuration);
    const performanceDrop = Math.max(0, Number(metrics.avgDuration || 0) - previousAvgDuration);
    return {
      periodic: input.periodic === true,
      failureRate,
      failureCount: Number(metrics.failCount || input.failureCount || 0),
      successRateDrop,
      performanceDrop,
      newSkill: input.newSkill === true || input.eventType === "skill_added",
      usageFrequency: Number(metrics.sampleCount || 0)
    };
  }

  buildHints({ taskType = "", metrics = {}, signals = {}, learningTasks = [] } = {}) {
    const hints = [];
    if (signals.failureRate >= 0.25 || signals.failureCount >= 3) {
      hints.push({ type: "failure_learning", taskType, suggestion: "review high-frequency failures before choosing strategy" });
    }
    if (signals.performanceDrop > 0) {
      hints.push({ type: "performance_learning", taskType, suggestion: "prefer lower-duration verified strategy when alternatives exist" });
    }
    if (metrics.reflectionCount > 0) {
      hints.push({ type: "reflection_learning", taskType, suggestion: "apply reflection improvements as planning advice" });
    }
    if (metrics.experienceCount > 0) {
      hints.push({ type: "experience_learning", taskType, suggestion: "reuse verified recovery experience as advisory context" });
    }
    if (signals.newSkill) {
      hints.push({ type: "skill_learning", taskType, suggestion: "index new skill and compare with existing knowledge before recommending" });
    }
    if (!hints.length && learningTasks.length) {
      hints.push({ type: "scheduled_learning", taskType, suggestion: "perform scheduled learning review" });
    }
    return hints.map((hint) => ({ ...hint, advisoryOnly: true }));
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
      learningOnly: true,
      advisoryOnly: true,
      executesTool: false,
      modifiesPermission: false,
      bypassesToolSelector: false,
      bypassesVerifierCenter: false
    };
  }

  ensureStore() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.planFile)) this.writeJson(this.planFile, { learningHints: [], safety: this.safety() });
  }

  writeJson(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  }
}

module.exports = { LearningOrchestrator, DEFAULT_LEARNING_ROOT };
