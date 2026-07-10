const { DecisionEngine } = require("./decision-engine");
const { ReasoningMemory } = require("./reasoning-memory");

function normalize(value = "") {
  return String(value || "").toLowerCase();
}

function includesCalculator(value = "") {
  return /calculator|calc|\u8ba1\u7b97\u5668/.test(normalize(value));
}

function averageSuccessRate(knowledgeHints = {}, tools = []) {
  const rates = [];
  const matches = Array.isArray(knowledgeHints.matches) ? knowledgeHints.matches : [];
  for (const match of matches) {
    const matchTools = Array.isArray(match.tools) ? match.tools : [];
    if (tools.some((tool) => matchTools.includes(tool))) rates.push(Number(match.successRate || 0));
  }
  if (rates.length) return rates.reduce((sum, item) => sum + item, 0) / rates.length;
  const hintRate = Number(knowledgeHints.successRate || 0);
  return Number.isFinite(hintRate) && hintRate > 0 ? hintRate : 0;
}

class ReasoningEngine {
  constructor({ decisionEngine = null, reasoningMemory = null } = {}) {
    this.decisionEngine = decisionEngine || new DecisionEngine();
    this.reasoningMemory = reasoningMemory || new ReasoningMemory();
  }

  reason(input = {}) {
    const taskType = input.taskType || this.inferTaskType(input.goal || "");
    const candidatePlans = this.buildCandidatePlans({ ...input, taskType });
    const decision = this.decisionEngine.decide({ candidatePlans });
    const selectedPlan = decision.selectedStrategy || null;
    return {
      taskType,
      candidatePlans,
      selectedPlan,
      decision,
      confidence: decision.score,
      reason: selectedPlan
        ? `selected ${selectedPlan.id || "strategy"} with score ${decision.score}`
        : "no candidate strategy"
    };
  }

  recordOutcome({ reasoningResult = null, success = false } = {}) {
    if (!reasoningResult?.selectedPlan) return null;
    return this.reasoningMemory.recordDecision({
      taskType: reasoningResult.taskType || "",
      selectedPlan: reasoningResult.selectedPlan,
      reason: reasoningResult.reason || "",
      success
    });
  }

  inferTaskType(goal = "") {
    if (includesCalculator(goal)) return "dev.code.calculator";
    if (/html|app|\u5e94\u7528|\u8f6f\u4ef6/.test(normalize(goal))) return "dev.code";
    if (/\u6587\u4ef6|file|folder|\u6587\u4ef6\u5939/.test(normalize(goal))) return "file.create";
    return "general.chat";
  }

  buildCandidatePlans({ goal = "", taskType = "", knowledgeHints = {}, historicalExperience = [] } = {}) {
    const candidates = [];
    const recommended = Array.isArray(knowledgeHints.recommendedTools) ? knowledgeHints.recommendedTools : [];
    const memoryMatches = this.reasoningMemory.query({ taskType });
    if (includesCalculator(goal) || taskType === "dev.code.calculator") {
      candidates.push({
        id: "calculator_direct",
        taskType,
        tools: ["calculator_creator", "browser_open"],
        successRate: Math.max(0.99, averageSuccessRate(knowledgeHints, ["calculator_creator", "browser_open"])),
        toolStability: this.experienceStability(historicalExperience, ["calculator_creator", "browser_open"], 0.99),
        avgDuration: 1500,
        riskLevel: "low",
        resourceCost: 2
      });
      candidates.push({
        id: "html_fallback",
        taskType,
        tools: ["html_app_creator", "open_path"],
        successRate: Math.max(0.9, averageSuccessRate(knowledgeHints, ["html_app_creator", "open_path"])),
        toolStability: this.experienceStability(historicalExperience, ["html_app_creator", "open_path"], 0.9),
        avgDuration: 2200,
        riskLevel: "low",
        resourceCost: 2
      });
    }
    if (recommended.length) {
      candidates.push({
        id: "knowledge_recommended",
        taskType,
        tools: recommended,
        successRate: averageSuccessRate(knowledgeHints, recommended) || Number(knowledgeHints.successRate || 0.75),
        toolStability: this.experienceStability(historicalExperience, recommended, 0.75),
        avgDuration: 1800,
        riskLevel: "low",
        resourceCost: recommended.length
      });
    }
    for (const item of memoryMatches.slice(-3)) {
      if (item.selectedPlan?.tools?.length) {
        candidates.push({
          ...item.selectedPlan,
          id: `${item.selectedPlan.id || "memory"}_memory`,
          successRate: Math.max(0.8, Number(item.selectedPlan.successRate || 0.8)),
          toolStability: Math.max(0.8, Number(item.selectedPlan.toolStability || 0.8))
        });
      }
    }
    return candidates;
  }

  experienceStability(experiences = [], tools = [], fallback = 0.7) {
    const relevant = (Array.isArray(experiences) ? experiences : []).filter((item) => tools.includes(item.toolId));
    if (!relevant.length) return fallback;
    const success = relevant.filter((item) => item.success === true).length;
    return success / relevant.length;
  }
}

module.exports = { ReasoningEngine };
