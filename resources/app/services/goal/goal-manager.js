const fs = require("node:fs");
const path = require("node:path");
const { IntentAnalyzer } = require("../intent/intent-analyzer");
const { KnowledgeRetriever } = require("../knowledge/knowledge-retriever");
const { AgentIdentityCenter } = require("../identity/agent-identity-center");
const { ReflectionMemory } = require("../reflection/reflection-memory");
const { AutonomyLevelManager } = require("../autonomy/autonomy-level-manager");
const { GoalDecomposer } = require("./goal-decomposer");
const { GoalPriorityEngine } = require("./goal-priority-engine");
const { GoalProgressTracker, DEFAULT_GOAL_ROOT } = require("./goal-progress-tracker");

function nowIso() {
  return new Date().toISOString();
}

class GoalManager {
  constructor({
    rootDir = DEFAULT_GOAL_ROOT,
    intentAnalyzer = null,
    knowledgeRetriever = null,
    identityCenter = null,
    reflectionMemory = null,
    autonomyLevelManager = null,
    goalDecomposer = null,
    priorityEngine = null,
    progressTracker = null
  } = {}) {
    this.rootDir = rootDir;
    this.goalsFile = path.join(rootDir, "goals.json");
    this.knowledgeRetriever = knowledgeRetriever || new KnowledgeRetriever();
    this.identityCenter = identityCenter || new AgentIdentityCenter();
    this.reflectionMemory = reflectionMemory || new ReflectionMemory();
    this.autonomyLevelManager = autonomyLevelManager || new AutonomyLevelManager();
    this.intentAnalyzer = intentAnalyzer || new IntentAnalyzer({
      knowledgeRetriever: this.knowledgeRetriever,
      identityCenter: this.identityCenter,
      reflectionMemory: this.reflectionMemory,
      autonomyLevelManager: this.autonomyLevelManager
    });
    this.goalDecomposer = goalDecomposer || new GoalDecomposer({ rootDir });
    this.priorityEngine = priorityEngine || new GoalPriorityEngine({
      rootDir,
      knowledgeRetriever: this.knowledgeRetriever,
      reflectionMemory: this.reflectionMemory,
      autonomyLevelManager: this.autonomyLevelManager
    });
    this.progressTracker = progressTracker || new GoalProgressTracker({ rootDir });
    this.ensureStore();
  }

  createGoal({ input = "", agentId = "default-agent", conversation = [] } = {}) {
    const intentAnalysis = this.intentAnalyzer.analyze({ input, agentId, conversation });
    const identity = this.identityCenter.getIdentity(agentId);
    const autonomy = this.autonomyLevelManager.getLevel(agentId);
    const goal = {
      goalId: `goal-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      agentId,
      sourceInput: input,
      intent: intentAnalysis.intent,
      intentType: intentAnalysis.intentType,
      taskType: intentAnalysis.goal.taskType,
      goal: intentAnalysis.goal.goal,
      requirements: intentAnalysis.goal.requirements || [],
      confidence: intentAnalysis.confidence,
      riskLevel: intentAnalysis.context.signals.includes("high_risk_possible") ? "high" : intentAnalysis.goal.requirements.includes("desktop target") ? "medium" : "low",
      identityKnown: Boolean(identity),
      autonomyLevel: autonomy.level,
      status: "active",
      createdAt: nowIso(),
      updatedAt: nowIso(),
      safety: {
        managementOnly: true,
        executesTool: false,
        bypassesToolSelector: false,
        bypassesVerifierCenter: false
      }
    };
    const decomposition = this.goalDecomposer.decompose(goal);
    goal.subGoals = decomposition.subGoals;
    goal.dependencies = decomposition.dependencies;
    const priority = this.priorityEngine.prioritize([goal], { agentId }).ranked[0];
    goal.priorityScore = priority.priorityScore;
    goal.priorityReason = priority.priorityReason;
    const progress = this.progressTracker.start(goal);
    this.saveGoal(goal);
    return { goal, intentAnalysis, decomposition, priority, progress };
  }

  updateProgress(goalId = "", patch = {}) {
    const progress = this.progressTracker.update(goalId, patch);
    const data = this.load();
    if (data.goals[goalId]) {
      data.goals[goalId].status = progress.status;
      data.goals[goalId].progress = progress.percent;
      data.goals[goalId].updatedAt = nowIso();
      this.writeJson(this.goalsFile, { goals: data.goals });
    }
    return progress;
  }

  getGoal(goalId = "") {
    return this.load().goals[goalId] || null;
  }

  listGoals() {
    return Object.values(this.load().goals);
  }

  rankGoals(agentId = "default-agent") {
    return this.priorityEngine.prioritize(this.listGoals(), { agentId });
  }

  saveGoal(goal = {}) {
    const data = this.load();
    data.goals[goal.goalId] = goal;
    this.writeJson(this.goalsFile, { goals: data.goals });
  }

  load() {
    return this.readJson(this.goalsFile, { goals: {} });
  }

  ensureStore() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.goalsFile)) this.writeJson(this.goalsFile, { goals: {} });
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

module.exports = { GoalManager };
