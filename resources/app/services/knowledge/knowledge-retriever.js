const { KnowledgeCenter } = require("./knowledge-center");
const { KnowledgeIndexer } = require("./knowledge-indexer");

function normalize(value = "") {
  return String(value || "").trim().toLowerCase();
}

class KnowledgeRetriever {
  constructor({ knowledgeCenter = null, indexer = null } = {}) {
    this.knowledgeCenter = knowledgeCenter || new KnowledgeCenter();
    this.indexer = indexer || new KnowledgeIndexer({ knowledgeCenter: this.knowledgeCenter });
  }

  retrieve({ task = "", taskType = "", intent = "" } = {}) {
    const query = taskType || intent || task;
    let index = this.knowledgeCenter.loadIndex();
    if (!Object.keys(index.tasks || {}).length) index = this.indexer.buildIndex().index;
    const normalized = normalize(query);
    const matches = Object.entries(index.tasks || {})
      .filter(([key]) => {
        const name = normalize(key);
        return !normalized || name.includes(normalized) || normalized.includes(name);
      })
      .map(([key, value]) => ({ taskType: key, ...value }))
      .sort((a, b) => Number(b.successRate || 0) - Number(a.successRate || 0));
    const best = matches[0] || null;
    return {
      similarTasks: matches.length,
      recommendedTools: best?.tools || [],
      recommendedSkills: best?.skills || [],
      experience: best?.experience || [],
      successRate: Number(best?.successRate || 0),
      matches
    };
  }
}

module.exports = { KnowledgeRetriever };
