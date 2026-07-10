const { PerformanceTracker } = require("../optimization/performance-tracker");
const { ExperienceCenter } = require("../experience/experience-center");
const { KnowledgeCenter } = require("../knowledge/knowledge-center");
const { ReasoningMemory } = require("../reasoning/reasoning-memory");

class StrategyAnalyzer {
  constructor({ performanceTracker = null, experienceCenter = null, knowledgeCenter = null, reasoningMemory = null } = {}) {
    this.performanceTracker = performanceTracker || new PerformanceTracker();
    this.experienceCenter = experienceCenter || new ExperienceCenter();
    this.knowledgeCenter = knowledgeCenter || new KnowledgeCenter();
    this.reasoningMemory = reasoningMemory || new ReasoningMemory();
  }

  analyze({ taskType = "" } = {}) {
    const strategies = [];
    for (const plan of this.knowledgeCenter.queryHistoricalPlans?.({ taskType }) || []) {
      strategies.push({
        id: plan.tools.join("+"),
        taskType: plan.taskType || taskType,
        tools: plan.tools,
        successRate: Number(plan.successRate || 0),
        source: "knowledge"
      });
    }
    for (const item of this.reasoningMemory.query({ taskType })) {
      if (item.selectedPlan?.tools?.length) {
        strategies.push({
          id: item.selectedPlan.tools.join("+"),
          taskType: item.taskType || taskType,
          tools: item.selectedPlan.tools,
          successRate: Number(item.selectedPlan.successRate || 0.8),
          source: "reasoning"
        });
      }
    }
    for (const perf of this.performanceTracker.list()) {
      if (taskType && perf.taskType !== taskType) continue;
      strategies.push({
        id: perf.toolId,
        taskType: perf.taskType || taskType,
        tools: [perf.toolId],
        successRate: Number(perf.successRate || 0),
        avgDuration: Number(perf.avgDuration || 0),
        source: "performance"
      });
    }
    const recoveryCount = (this.experienceCenter.list?.() || [])
      .filter((item) => !taskType || item.taskType === taskType)
      .filter((item) => item.success === true).length;
    const ranked = this.merge(strategies).sort((a, b) => Number(b.successRate || 0) - Number(a.successRate || 0));
    return {
      taskType,
      strategies: ranked,
      recommendation: ranked[0] || null,
      recoveryCount
    };
  }

  merge(items = []) {
    const map = new Map();
    for (const item of items) {
      const key = item.id || (item.tools || []).join("+");
      const previous = map.get(key) || { ...item, samples: 0 };
      previous.successRate = Math.max(Number(previous.successRate || 0), Number(item.successRate || 0));
      previous.avgDuration = Math.max(0, Number(item.avgDuration || previous.avgDuration || 0));
      previous.samples = Number(previous.samples || 0) + 1;
      previous.sources = Array.from(new Set([...(previous.sources || []), item.source].filter(Boolean)));
      map.set(key, previous);
    }
    return Array.from(map.values());
  }
}

module.exports = { StrategyAnalyzer };
