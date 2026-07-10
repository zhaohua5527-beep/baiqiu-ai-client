const { PerformanceTracker } = require("./performance-tracker");
const { ExperienceCenter } = require("../experience/experience-center");
const { KnowledgeCenter } = require("../knowledge/knowledge-center");
const { KnowledgeRetriever } = require("../knowledge/knowledge-retriever");

class StrategyOptimizer {
  constructor({ performanceTracker = null, experienceCenter = null, knowledgeCenter = null, knowledgeRetriever = null, minSamples = 10 } = {}) {
    this.performanceTracker = performanceTracker || new PerformanceTracker();
    this.experienceCenter = experienceCenter || new ExperienceCenter();
    this.knowledgeCenter = knowledgeCenter || new KnowledgeCenter();
    this.knowledgeRetriever = knowledgeRetriever || new KnowledgeRetriever({ knowledgeCenter: this.knowledgeCenter });
    this.minSamples = minSamples;
  }

  getRecommendation({ taskType = "", toolId = "", reasoningResult = null } = {}) {
    const performance = this.performanceTracker.get(toolId, taskType);
    if (!performance || Number(performance.sampleCount || 0) < this.minSamples) {
      return {
        available: false,
        toolId,
        taskType,
        reason: "insufficient_samples",
        score: 0,
        performance: performance || null
      };
    }
    const experienceWeight = this.experienceWeight({ taskType, toolId });
    const knowledge = this.knowledgeRecommendation({ taskType, toolId });
    const knowledgeWeight = knowledge.found ? Math.min(0.1, Number(knowledge.successRate || 0) * 0.05) : 0;
    const reasoningWeight = this.reasoningWeight({ taskType, toolId, reasoningResult });
    const score = Math.max(0, Math.min(1, Number(performance.successRate || 0) + experienceWeight + knowledgeWeight + reasoningWeight));
    return {
      available: true,
      toolId,
      taskType,
      score,
      successRate: performance.successRate,
      avgDuration: performance.avgDuration,
      sampleCount: performance.sampleCount,
      experienceWeight,
      knowledgeWeight,
      reasoningWeight,
      knowledge,
      recommendedAction: "prefer_high_success_rate"
    };
  }

  rankTools(tools = [], { taskType = "", intent = "" } = {}) {
    const type = taskType || intent || "";
    return [...tools].sort((a, b) => {
      const aScore = this.scoreTool(a, type);
      const bScore = this.scoreTool(b, type);
      if (bScore.score !== aScore.score) return bScore.score - aScore.score;
      return Number(a.__originalIndex || 0) - Number(b.__originalIndex || 0);
    }).map((tool) => {
      const score = this.scoreTool(tool, type);
      const copy = { ...tool };
      delete copy.__originalIndex;
      if (score.available) copy.optimization = score;
      return copy;
    });
  }

  scoreTool(tool = {}, taskType = "") {
    const recommendation = this.getRecommendation({ taskType, toolId: tool.id || "" });
    if (!recommendation.available) return { available: false, score: 0 };
    return recommendation;
  }

  experienceWeight({ taskType = "", toolId = "" } = {}) {
    const experiences = this.experienceCenter.list?.() || [];
    const matching = experiences.filter((item) => {
      if (taskType && item.taskType !== taskType) return false;
      if (toolId && item.toolId !== toolId) return false;
      return true;
    });
    const success = matching.filter((item) => item.success === true).length;
    const failed = matching.filter((item) => item.success === false).length;
    return Math.max(-0.1, Math.min(0.1, (success * 0.02) - (failed * 0.03)));
  }

  knowledgeRecommendation({ taskType = "", toolId = "" } = {}) {
    const hints = this.knowledgeRetriever.retrieve({ taskType, intent: taskType });
    const found = Boolean(toolId && hints.recommendedTools.includes(toolId));
    return {
      found,
      recommendedTools: hints.recommendedTools,
      successRate: hints.successRate,
      similarTasks: hints.similarTasks
    };
  }

  reasoningWeight({ toolId = "", reasoningResult = null } = {}) {
    if (!toolId || !reasoningResult?.selectedPlan) return 0;
    const tools = Array.isArray(reasoningResult.selectedPlan.tools) ? reasoningResult.selectedPlan.tools : [];
    if (!tools.includes(toolId)) return 0;
    return Math.min(0.08, Math.max(0, Number(reasoningResult.confidence || 0) * 0.05));
  }
}

module.exports = { StrategyOptimizer };
