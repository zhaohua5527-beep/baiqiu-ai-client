const { KnowledgeRetriever } = require("../knowledge/knowledge-retriever");

class GoalUnderstandingEngine {
  constructor({ knowledgeRetriever = null } = {}) {
    this.knowledgeRetriever = knowledgeRetriever || new KnowledgeRetriever();
  }

  understand({ input = "", intent = "", context = {} } = {}) {
    const taskType = this.inferTaskType(input, intent);
    const requirements = this.extractRequirements(input, taskType, context);
    const knowledgeHints = this.knowledgeRetriever.retrieve({ task: input, taskType, intent });
    const goal = {
      goal: this.describeGoal(taskType, input),
      taskType,
      requirements,
      expectedOutcome: this.expectedOutcome(taskType),
      knowledgeHints,
      confidence: this.scoreGoal(taskType, requirements, knowledgeHints),
      safety: {
        analysisOnly: true,
        executesTool: false,
        bypassesToolSelector: false,
        bypassesVerifierCenter: false
      }
    };
    return goal;
  }

  inferTaskType(input = "", intent = "") {
    const text = String(input || "").toLowerCase();
    if (/计算器/.test(text)) return "dev.code.calculator";
    if (/文件夹/.test(text)) return "file.folder";
    if (/文本文件|txt|文件/.test(text)) return "file.create";
    if (/技能|学习/.test(text)) return "skill.learning";
    if (/关闭电脑|关机/.test(text)) return "system.shutdown";
    if (/我叫什么|项目叫什么|记住|名字叫|项目叫/.test(text)) return "memory.query_or_update";
    if (intent && intent !== "unknown") return intent;
    return "general.chat";
  }

  extractRequirements(input = "", taskType = "", context = {}) {
    const text = String(input || "");
    const requirements = [];
    if (taskType === "dev.code.calculator") requirements.push("generate app", "save file");
    if (/打开|启动|运行/.test(text)) requirements.push("open result");
    if (/桌面/.test(text)) requirements.push("desktop target");
    if (/文件夹/.test(text)) requirements.push("create folder");
    if (/三个|3个|三份/.test(text)) requirements.push("quantity:3");
    if (/里面|放入/.test(text)) requirements.push("nested content");
    if (/学习|技能/.test(text)) requirements.push("skill capability check");
    if (/关闭电脑|关机/.test(text)) requirements.push("human confirmation");
    if (context.signals?.includes("memory_fact")) requirements.push("memory handling");
    return Array.from(new Set(requirements));
  }

  describeGoal(taskType = "", input = "") {
    const map = {
      "dev.code.calculator": "create calculator application",
      "file.folder": "create folder and manage contained files",
      "file.create": "create file",
      "skill.learning": "learn or validate requested skill capability",
      "system.shutdown": "prepare high risk system shutdown request",
      "memory.query_or_update": "understand memory update or query",
      "general.chat": "answer or clarify user request"
    };
    return map[taskType] || String(input || "").slice(0, 100);
  }

  expectedOutcome(taskType = "") {
    if (taskType === "system.shutdown") return "confirm_required";
    if (taskType === "skill.learning") return "capability_verified_or_missing";
    if (taskType === "general.chat") return "human_language_answer";
    return "plan_ready";
  }

  scoreGoal(taskType = "", requirements = [], knowledgeHints = {}) {
    let score = taskType && taskType !== "general.chat" ? 0.7 : 0.5;
    if (requirements.length) score += 0.15;
    if (Number(knowledgeHints.successRate || 0) > 0) score += Math.min(0.15, Number(knowledgeHints.successRate || 0) * 0.15);
    return Math.min(0.99, Number(score.toFixed(2)));
  }
}

module.exports = { GoalUnderstandingEngine };
