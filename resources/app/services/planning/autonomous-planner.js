const fs = require("node:fs");
const path = require("node:path");
const { GoalAnalyzer } = require("./goal-analyzer");
const { PlanEvaluator } = require("./plan-evaluator");
const { TaskDecomposer } = require("./task-decomposer");
const { DependencyBuilder } = require("./dependency-builder");
const { ReasoningEngine } = require("../reasoning/reasoning-engine");
const { KnowledgeRetriever } = require("../knowledge/knowledge-retriever");
const { MetaLearningCenter } = require("../meta-learning/meta-learning-center");
const { ReflectionMemory } = require("../reflection/reflection-memory");
const { ExperienceCenter } = require("../experience/experience-center");

const DEFAULT_PLANNING_ROOT = path.join("D:\\BaiQiuAI", "data", "planning");

class AutonomousPlanner {
  constructor({
    rootDir = DEFAULT_PLANNING_ROOT,
    goalAnalyzer = null,
    planEvaluator = null,
    taskDecomposer = null,
    dependencyBuilder = null,
    reasoningEngine = null,
    knowledgeRetriever = null,
    metaLearningCenter = null,
    reflectionMemory = null,
    experienceCenter = null
  } = {}) {
    this.rootDir = rootDir;
    this.plansFile = path.join(rootDir, "plans.json");
    this.evaluationsFile = path.join(rootDir, "plan-evaluations.json");
    this.goalAnalyzer = goalAnalyzer || new GoalAnalyzer();
    this.planEvaluator = planEvaluator || new PlanEvaluator();
    this.taskDecomposer = taskDecomposer || new TaskDecomposer();
    this.dependencyBuilder = dependencyBuilder || new DependencyBuilder();
    this.reasoningEngine = reasoningEngine || new ReasoningEngine();
    this.knowledgeRetriever = knowledgeRetriever || new KnowledgeRetriever();
    this.metaLearningCenter = metaLearningCenter || new MetaLearningCenter();
    this.reflectionMemory = reflectionMemory || new ReflectionMemory();
    this.experienceCenter = experienceCenter || new ExperienceCenter();
    this.ensureStore();
  }

  plan(input = {}) {
    const text = input.text || input.goal || "";
    const goal = this.goalAnalyzer.analyze(text);
    const knowledgeHints = input.knowledgeHints || this.knowledgeRetriever.retrieve({
      task: text,
      taskType: goal.taskType,
      intent: goal.taskType
    });
    const reasoningResult = input.reasoningResult || this.reasoningEngine.reason({
      goal: text,
      taskType: goal.taskType,
      historicalExperience: this.experienceCenter.list?.() || [],
      knowledgeHints
    });
    const metaHints = input.metaHints || this.metaLearningCenter.getHints({ taskType: goal.taskType });
    const reflectionHints = input.reflectionHints || this.reflectionMemory.getHints({ taskType: goal.taskType });
    const actions = this.taskDecomposer.decompose(text);
    if (!actions.length) return this.finish({ goal, strategy: "fallback_to_legacy", steps: [], confidence: 0, knowledgeHints, reasoningResult, metaHints, reflectionHints });
    const steps = this.dependencyBuilder.apply(actions.map((action, index) => this.actionToStep(action, index, text)));
    const rawPlan = {
      goal: goal.goal,
      taskType: goal.taskType,
      requirements: goal.requirements,
      strategy: reasoningResult.selectedPlan?.id || metaHints.recommendation || "autonomous_task_graph",
      steps,
      knowledgeHints,
      reasoningResult,
      metaHints,
      reflectionHints
    };
    const evaluation = this.planEvaluator.evaluate(rawPlan);
    const output = this.finish({
      ...rawPlan,
      confidence: evaluation.confidence,
      evaluation
    });
    this.savePlan(output);
    this.saveEvaluation({ goal: output.goal, strategy: output.strategy, evaluation });
    return output;
  }

  actionToStep(action = {}, index = 0, sourceText = "") {
    const id = `step-${index + 1}.${action.action}.${action.target}`.replace(/[^a-zA-Z0-9_.-]/g, "_");
    const step = {
      id,
      taskId: id,
      step: index + 1,
      action: action.action || "",
      target: action.target || "",
      intent: this.intentFor(action),
      type: action.action === "clarify" ? "clarification" : "tool",
      toolId: action.toolId || this.toolFor(action),
      args: this.argsFor(action, sourceText),
      dependsOn: Array.isArray(action.dependsOn) ? action.dependsOn : [],
      verifier: this.verifierFor(action),
      retryLimit: action.action === "clarify" ? 0 : 1,
      executable: action.action !== "clarify",
      reason: action.reason || ""
    };
    if (action.action === "learn" && /^(weather|reminder)$/.test(String(action.target || ""))) {
      step.executable = false;
      step.reason = action.target === "weather"
        ? "\u7f3a\u5c11\u771f\u5b9e\u5929\u6c14\u67e5\u8be2\u5de5\u5177\u6216\u5929\u6c14API\uff0c\u4e0d\u80fd\u5b89\u88c5\u5929\u6c14\u67e5\u8be2\u6280\u80fd\u3002"
        : "\u7f3a\u5c11\u771f\u5b9e\u63d0\u9192/\u65e5\u7a0b\u5de5\u5177\uff0c\u4e0d\u80fd\u5b89\u88c5\u63d0\u9192\u6280\u80fd\u3002";
    }
    return step;
  }

  intentFor(action = {}) {
    if (action.action === "clarify") return "clarification.required";
    if (action.target === "calculator") return "dev.code.calculator";
    if (action.target === "folder" || action.target === "text_file") return action.action === "open" ? "system.open" : "file.create";
    if (action.action === "shutdown") return "system.shutdown";
    if (action.action === "learn") return "skill.learn";
    return "general.chat";
  }

  toolFor(action = {}) {
    if (action.action === "clarify") return "";
    if (action.target === "calculator" && action.action === "create") return "calculator_creator";
    if (action.action === "open") return "browser_open";
    if (action.target === "folder" && action.action === "create") return "create_folder";
    if (action.target === "text_file") return "file_creator";
    if (action.action === "shutdown") return "system_shutdown";
    if (action.action === "learn") return "skill_install";
    return "";
  }

  argsFor(action = {}, sourceText = "") {
    if (action.target === "folder") return { message: sourceText, target: "folder" };
    if (action.target === "text_file") return { message: sourceText, index: action.countIndex || 1, container: action.container || "" };
    if (action.action === "open" && action.target === "calculator") return { path: "{{step1.file}}", target: action.target, internalApp: true };
    if (action.action === "open") return { message: sourceText, target: action.target };
    if (action.action === "shutdown") return { message: sourceText };
    if (action.action === "learn") return { message: sourceText, target: action.target };
    return { message: sourceText };
  }

  verifierFor(action = {}) {
    if (action.target === "calculator" && action.action === "create") return "calculator_creator";
    if (action.action === "open") return "browser_open";
    if (action.target === "folder") return "folder_exists";
    if (action.target === "text_file") return "file_creator";
    return "manual";
  }

  finish(plan = {}) {
    return {
      goal: plan.goal?.goal || plan.goal || "",
      strategy: plan.strategy || "",
      requirements: plan.requirements || plan.goal?.requirements || [],
      taskType: plan.taskType || plan.goal?.taskType || "",
      steps: Array.isArray(plan.steps) ? plan.steps : [],
      confidence: Number(plan.confidence || 0),
      evaluation: plan.evaluation || null,
      knowledgeHints: plan.knowledgeHints || null,
      reasoningResult: plan.reasoningResult || null,
      metaHints: plan.metaHints || null,
      reflectionHints: plan.reflectionHints || null
    };
  }

  ensureStore() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.plansFile)) this.writeJson(this.plansFile, { plans: [] });
    if (!fs.existsSync(this.evaluationsFile)) this.writeJson(this.evaluationsFile, { evaluations: [] });
  }

  savePlan(plan = {}) {
    const data = this.readJson(this.plansFile, { plans: [] });
    data.plans.push({ ...plan, timestamp: new Date().toISOString() });
    this.writeJson(this.plansFile, { plans: data.plans.slice(-300) });
  }

  saveEvaluation(evaluation = {}) {
    const data = this.readJson(this.evaluationsFile, { evaluations: [] });
    data.evaluations.push({ ...evaluation, timestamp: new Date().toISOString() });
    this.writeJson(this.evaluationsFile, { evaluations: data.evaluations.slice(-300) });
  }

  readJson(file, fallback) {
    this.ensureStore();
    try {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      return fallback;
    }
  }

  writeJson(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  }
}

module.exports = { AutonomousPlanner, DEFAULT_PLANNING_ROOT };
