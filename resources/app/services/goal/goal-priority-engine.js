const fs = require("node:fs");
const path = require("node:path");
const { KnowledgeRetriever } = require("../knowledge/knowledge-retriever");
const { ReflectionMemory } = require("../reflection/reflection-memory");
const { AutonomyLevelManager } = require("../autonomy/autonomy-level-manager");
const { DEFAULT_GOAL_ROOT } = require("./goal-progress-tracker");

function nowIso() {
  return new Date().toISOString();
}

class GoalPriorityEngine {
  constructor({ rootDir = DEFAULT_GOAL_ROOT, knowledgeRetriever = null, reflectionMemory = null, autonomyLevelManager = null } = {}) {
    this.rootDir = rootDir;
    this.prioritiesFile = path.join(rootDir, "goal-priorities.json");
    this.knowledgeRetriever = knowledgeRetriever || new KnowledgeRetriever();
    this.reflectionMemory = reflectionMemory || new ReflectionMemory();
    this.autonomyLevelManager = autonomyLevelManager || new AutonomyLevelManager();
    this.ensureStore();
  }

  prioritize(goals = [], { agentId = "default-agent" } = {}) {
    const autonomy = this.autonomyLevelManager.getLevel(agentId);
    const ranked = goals.map((goal) => this.scoreGoal(goal, autonomy)).sort((a, b) => Number(b.priorityScore || 0) - Number(a.priorityScore || 0));
    const result = {
      agentId,
      ranked,
      safety: {
        managementOnly: true,
        executesTool: false,
        bypassesToolSelector: false,
        bypassesVerifierCenter: false
      },
      timestamp: nowIso()
    };
    this.append(result);
    return result;
  }

  scoreGoal(goal = {}, autonomy = {}) {
    const taskType = goal.taskType || "";
    const knowledge = this.knowledgeRetriever.retrieve({ taskType, task: goal.sourceInput || goal.goal || "" });
    const reflection = this.reflectionMemory.getHints({ taskType });
    const riskPenalty = goal.riskLevel === "high" ? 30 : goal.riskLevel === "medium" ? 10 : 0;
    const confidenceScore = Math.round(Number(goal.confidence || 0) * 40);
    const knowledgeScore = Math.round(Number(knowledge.successRate || 0) * 25);
    const reflectionScore = reflection.available ? Math.round(Number(reflection.confidence || 0) * 15) : 0;
    const autonomyScore = Number(autonomy.score || 0) * 5;
    const urgencyScore = goal.intent === "high_risk_action" ? 5 : goal.intentType === "task" ? 15 : 8;
    const priorityScore = Math.max(0, confidenceScore + knowledgeScore + reflectionScore + autonomyScore + urgencyScore - riskPenalty);
    return {
      ...goal,
      priorityScore,
      priorityReason: {
        confidenceScore,
        knowledgeScore,
        reflectionScore,
        autonomyScore,
        urgencyScore,
        riskPenalty
      }
    };
  }

  append(item = {}) {
    const data = this.load();
    data.priorities.push(item);
    this.writeJson(this.prioritiesFile, { priorities: data.priorities.slice(-300) });
  }

  load() {
    return this.readJson(this.prioritiesFile, { priorities: [] });
  }

  ensureStore() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.prioritiesFile)) this.writeJson(this.prioritiesFile, { priorities: [] });
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

module.exports = { GoalPriorityEngine };
