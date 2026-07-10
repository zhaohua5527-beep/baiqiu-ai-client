const { KnowledgeCenter } = require("./knowledge-center");

const OUTDATED_DAYS = 180;

class KnowledgeAnalyzer {
  constructor({ knowledgeCenter = null, now = () => Date.now() } = {}) {
    this.knowledgeCenter = knowledgeCenter || new KnowledgeCenter();
    this.now = now;
  }

  analyze() {
    const items = this.knowledgeCenter.loadKnowledge().items;
    const now = this.now();
    return items.map((item) => {
      const success = Number(item.successCount || 0);
      const fail = Number(item.failCount || 0);
      const total = success + fail;
      const successRate = total ? success / total : Number(item.successRate || 0);
      const ageMs = now - new Date(item.timestamp || 0).getTime();
      const outdated = ageMs > OUTDATED_DAYS * 24 * 60 * 60 * 1000;
      const lowQuality = successRate < 0.5;
      return {
        id: item.id,
        type: item.type,
        taskType: item.taskType,
        toolId: item.toolId,
        usageCount: Number(item.usageCount || 0),
        successRate,
        failureRate: 1 - successRate,
        outdated,
        lowQuality,
        weight: lowQuality || outdated ? 0.5 : 1
      };
    });
  }
}

module.exports = { KnowledgeAnalyzer, OUTDATED_DAYS };
