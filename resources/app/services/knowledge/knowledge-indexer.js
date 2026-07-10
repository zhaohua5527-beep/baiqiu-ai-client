const { KnowledgeCenter } = require("./knowledge-center");

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

class KnowledgeIndexer {
  constructor({ knowledgeCenter = null } = {}) {
    this.knowledgeCenter = knowledgeCenter || new KnowledgeCenter();
  }

  buildIndex() {
    const items = this.knowledgeCenter.loadKnowledge().items;
    const index = { tasks: {}, tools: {}, failures: {} };
    const relations = [];
    for (const item of items) {
      const task = item.taskType || item.source || "unknown";
      const taskEntry = index.tasks[task] || { tools: [], skills: [], experience: [], successRates: [] };
      if (item.toolId) taskEntry.tools.push(item.toolId);
      if (item.skill) taskEntry.skills.push(item.skill);
      if (item.experience) taskEntry.experience.push(item.experience);
      if (Number.isFinite(Number(item.successRate))) taskEntry.successRates.push(Number(item.successRate));
      index.tasks[task] = taskEntry;
      if (item.toolId) {
        const toolEntry = index.tools[item.toolId] || { successRates: [], tasks: [] };
        toolEntry.successRates.push(Number(item.successRate || 0));
        toolEntry.tasks.push(task);
        index.tools[item.toolId] = toolEntry;
        relations.push({ from: task, to: item.toolId, type: "task_tool", knowledgeId: item.id });
      }
      if (item.experience && /->/.test(item.experience)) {
        const [failure, solution] = item.experience.split("->").map((part) => part.trim());
        if (failure && solution) {
          index.failures[failure] ||= { solutions: [] };
          index.failures[failure].solutions.push(solution);
          relations.push({ from: failure, to: solution, type: "failure_solution", knowledgeId: item.id });
        }
      }
    }
    for (const entry of Object.values(index.tasks)) {
      entry.tools = unique(entry.tools);
      entry.skills = unique(entry.skills);
      entry.experience = unique(entry.experience);
      entry.successRate = entry.successRates.length
        ? entry.successRates.reduce((sum, value) => sum + value, 0) / entry.successRates.length
        : 0;
      delete entry.successRates;
    }
    for (const entry of Object.values(index.tools)) {
      entry.tasks = unique(entry.tasks);
      entry.successRate = entry.successRates.length
        ? entry.successRates.reduce((sum, value) => sum + value, 0) / entry.successRates.length
        : 0;
      delete entry.successRates;
    }
    for (const entry of Object.values(index.failures)) entry.solutions = unique(entry.solutions);
    this.knowledgeCenter.saveIndex(index);
    this.knowledgeCenter.saveRelations(relations);
    return { index, relations };
  }
}

module.exports = { KnowledgeIndexer };
