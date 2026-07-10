const fs = require("node:fs");
const path = require("node:path");
const { DEFAULT_GOAL_ROOT } = require("./goal-progress-tracker");

function nowIso() {
  return new Date().toISOString();
}

class GoalDecomposer {
  constructor({ rootDir = DEFAULT_GOAL_ROOT } = {}) {
    this.rootDir = rootDir;
    this.decompositionsFile = path.join(rootDir, "goal-decompositions.json");
    this.ensureStore();
  }

  decompose(goal = {}) {
    const taskType = goal.taskType || goal.intentAnalysis?.goal?.taskType || "";
    const requirements = Array.isArray(goal.requirements) ? goal.requirements : [];
    const subGoals = this.buildSubGoals(taskType, requirements, goal);
    const result = {
      goalId: goal.goalId || "",
      taskType,
      subGoals,
      dependencies: this.buildDependencies(subGoals),
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

  buildSubGoals(taskType = "", requirements = [], goal = {}) {
    const subGoals = [];
    const add = (name, type, extra = {}) => {
      subGoals.push({
        id: `goal-step-${subGoals.length + 1}`,
        name,
        type,
        status: "pending",
        dependsOn: extra.dependsOn || [],
        requirement: extra.requirement || "",
        riskLevel: extra.riskLevel || "low"
      });
    };

    if (taskType === "dev.code.calculator") {
      add("Generate calculator application", "create_application", { requirement: "generate app", riskLevel: "medium" });
      if (requirements.includes("save file")) add("Persist application file", "save_result", { dependsOn: ["goal-step-1"], requirement: "save file" });
      if (requirements.includes("open result")) add("Open generated application", "open_result", { dependsOn: ["goal-step-1"], requirement: "open result" });
    } else if (taskType === "file.folder" || requirements.includes("create folder")) {
      add("Create target folder", "create_folder", { requirement: "create folder" });
      if (requirements.includes("quantity:3")) {
        add("Create first contained file", "create_file", { dependsOn: ["goal-step-1"], requirement: "quantity:3", riskLevel: "medium" });
        add("Create second contained file", "create_file", { dependsOn: ["goal-step-1"], requirement: "quantity:3", riskLevel: "medium" });
        add("Create third contained file", "create_file", { dependsOn: ["goal-step-1"], requirement: "quantity:3", riskLevel: "medium" });
      }
      if (requirements.includes("open result")) add("Open target folder", "open_result", { dependsOn: [`goal-step-${Math.max(1, subGoals.length)}`] });
    } else if (taskType === "skill.learning") {
      add("Check requested skill capability", "capability_check", { requirement: "skill capability check" });
      add("Prepare skill learning recommendation", "skill_recommendation", { dependsOn: ["goal-step-1"] });
    } else if (taskType === "system.shutdown") {
      add("Confirm high risk system goal", "human_confirmation", { requirement: "human confirmation", riskLevel: "high" });
    } else if (taskType === "memory.query_or_update") {
      add("Understand memory fact or query", "memory_goal", { requirement: "memory handling" });
    } else {
      add(goal.goal || "Clarify user goal", "clarification", { requirement: "clarify or answer" });
    }
    return subGoals;
  }

  buildDependencies(subGoals = []) {
    return subGoals.map((item) => ({ id: item.id, dependsOn: item.dependsOn || [] }));
  }

  append(item = {}) {
    const data = this.load();
    data.decompositions.push(item);
    this.writeJson(this.decompositionsFile, { decompositions: data.decompositions.slice(-500) });
  }

  load() {
    return this.readJson(this.decompositionsFile, { decompositions: [] });
  }

  ensureStore() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.decompositionsFile)) this.writeJson(this.decompositionsFile, { decompositions: [] });
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

module.exports = { GoalDecomposer };
