const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_EVOLUTION_NETWORK_ROOT = path.join("D:\\BaiQiuAI", "data", "evolution-network");

function nowIso() {
  return new Date().toISOString();
}

function addUnique(list, item, keyFn) {
  const key = keyFn(item);
  if (!list.some((old) => keyFn(old) === key)) list.push(item);
}

class EvolutionGraph {
  constructor({ rootDir = DEFAULT_EVOLUTION_NETWORK_ROOT } = {}) {
    this.rootDir = rootDir;
    this.graphFile = path.join(rootDir, "knowledge-graph.json");
    this.ensureStore();
  }

  build({ knowledge = [], experience = [], reflection = [], learning = null, evolution = null, taskType = "" } = {}) {
    const nodes = [];
    const edges = [];
    const addNode = (node) => addUnique(nodes, node, (item) => item.id);
    const addEdge = (edge) => addUnique(edges, edge, (item) => `${item.from}->${item.to}:${item.type}`);
    const taskId = `task:${taskType || "general"}`;
    addNode({ id: taskId, type: "task", label: taskType || "general" });

    for (const item of knowledge) {
      const knowledgeId = `knowledge:${item.id || item.toolId || item.taskType || nodes.length}`;
      addNode({ id: knowledgeId, type: "knowledge", label: item.toolId || item.capability || item.taskType || "knowledge", data: item });
      addEdge({ from: taskId, to: knowledgeId, type: "task_knowledge" });
      if (item.toolId) {
        const strategyId = `strategy:${item.toolId}`;
        addNode({ id: strategyId, type: "strategy", label: item.toolId });
        addEdge({ from: knowledgeId, to: strategyId, type: "knowledge_strategy" });
      }
      if (item.skill) {
        const skillId = `skill:${item.skill}`;
        addNode({ id: skillId, type: "skill", label: item.skill });
        addEdge({ from: knowledgeId, to: skillId, type: "knowledge_skill" });
      }
      if (item.capability) {
        const capabilityId = `capability:${item.capability}`;
        addNode({ id: capabilityId, type: "capability", label: item.capability });
        addEdge({ from: knowledgeId, to: capabilityId, type: "knowledge_capability" });
      }
    }

    for (const item of experience) {
      const experienceId = `experience:${item.experienceId || item.toolId || nodes.length}`;
      addNode({ id: experienceId, type: "experience", label: item.errorType || item.solution || "experience", data: item });
      addEdge({ from: taskId, to: experienceId, type: "task_experience" });
      if (item.solution) {
        const strategyId = `strategy:${item.solution}`;
        addNode({ id: strategyId, type: "strategy", label: item.solution });
        addEdge({ from: experienceId, to: strategyId, type: "experience_strategy" });
      }
    }

    for (const item of reflection) {
      const reflectionId = `reflection:${item.timestamp || nodes.length}`;
      addNode({ id: reflectionId, type: "reflection", label: item.mistake || item.improvement || "reflection", data: item });
      addEdge({ from: taskId, to: reflectionId, type: "task_reflection" });
      if (item.improvement) {
        const improvementId = `improvement:${item.improvement}`;
        addNode({ id: improvementId, type: "improvement", label: item.improvement });
        addEdge({ from: reflectionId, to: improvementId, type: "reflection_improvement" });
      }
    }

    if (learning?.learningHints?.length || learning?.hints?.length) {
      const learningId = `learning:${taskType || "general"}`;
      addNode({ id: learningId, type: "learning", label: "learning" });
      addEdge({ from: taskId, to: learningId, type: "task_learning" });
      for (const hint of (learning.learningHints || learning.hints || [])) {
        const strategyId = `strategy:${hint.type || hint.suggestion}`;
        addNode({ id: strategyId, type: "strategy", label: hint.type || "learning_strategy", data: hint });
        addEdge({ from: learningId, to: strategyId, type: "learning_strategy" });
      }
    }

    if (evolution?.recommendations?.length) {
      const evolutionId = `evolution:${taskType || "general"}`;
      addNode({ id: evolutionId, type: "evolution", label: "evolution" });
      addEdge({ from: taskId, to: evolutionId, type: "task_evolution" });
      for (const item of evolution.recommendations) {
        const capabilityId = `capability:${item.target || item.type}`;
        addNode({ id: capabilityId, type: "capability", label: item.target || item.type, data: item });
        addEdge({ from: evolutionId, to: capabilityId, type: "evolution_capability" });
      }
    }

    const graph = {
      graphId: `knowledge-evolution-graph-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      taskType,
      nodes,
      edges,
      path: ["task", "experience", "strategy", "skill", "capability"],
      timestamp: nowIso(),
      safety: this.safety()
    };
    this.writeJson(this.graphFile, graph);
    return graph;
  }

  safety() {
    return {
      graphOnly: true,
      advisoryOnly: true,
      executesTool: false,
      modifiesPermission: false,
      bypassesToolSelector: false,
      bypassesVerifierCenter: false
    };
  }

  ensureStore() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.graphFile)) this.writeJson(this.graphFile, { nodes: [], edges: [], safety: this.safety() });
  }

  writeJson(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  }
}

module.exports = { EvolutionGraph, DEFAULT_EVOLUTION_NETWORK_ROOT };
