const fs = require("node:fs");
const path = require("node:path");
const { KnowledgeCenter } = require("../knowledge/knowledge-center");
const { ReflectionMemory } = require("../reflection/reflection-memory");
const { AgentEvolutionEngine } = require("../evolution/agent-evolution-engine");
const { DEFAULT_SKILL_ECOSYSTEM_ROOT } = require("./skill-registry");

function nowIso() {
  return new Date().toISOString();
}

class SkillEvaluator {
  constructor({ rootDir = DEFAULT_SKILL_ECOSYSTEM_ROOT, knowledgeCenter = null, reflectionMemory = null, evolutionEngine = null } = {}) {
    this.rootDir = rootDir;
    this.evaluationsFile = path.join(rootDir, "skill-evaluations.json");
    this.knowledgeCenter = knowledgeCenter || new KnowledgeCenter();
    this.reflectionMemory = reflectionMemory || new ReflectionMemory();
    this.evolutionEngine = evolutionEngine || new AgentEvolutionEngine({ knowledgeCenter: this.knowledgeCenter, reflectionMemory: this.reflectionMemory });
    this.ensureStore();
  }

  evaluate(skill = {}, { agentId = "default-agent" } = {}) {
    const knowledge = this.knowledgeCenter.queryKnowledge({ type: "skill", taskType: (skill.taskTypes || [])[0] || "" });
    const reflection = this.reflectionMemory.getHints({ taskType: (skill.taskTypes || [])[0] || "" });
    const evolution = this.evolutionEngine.generateEvolutionAdvice({
      agentId,
      taskType: (skill.taskTypes || [])[0] || "",
      currentVersion: skill.version || "1.0.0"
    });
    const statusScore = skill.status === "installed" ? 35 : skill.status === "registered" ? 20 : 5;
    const capabilityScore = Math.min(20, (skill.capabilities || []).length * 5);
    const taskScore = Math.min(15, (skill.taskTypes || []).length * 5);
    const knowledgeScore = Math.min(15, knowledge.length * 5);
    const reflectionScore = reflection.available ? Math.round(Number(reflection.confidence || 0) * 10) : 0;
    const evolutionScore = Math.round(Number(evolution.evaluation?.score || 0) * 0.05);
    const score = Math.min(100, statusScore + capabilityScore + taskScore + knowledgeScore + reflectionScore + evolutionScore);
    const evaluation = {
      evaluationId: `skill-eval-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      skillId: skill.skillId || "",
      score,
      status: score >= 80 ? "healthy" : score >= 50 ? "needs_review" : "weak",
      dimensions: {
        statusScore,
        capabilityScore,
        taskScore,
        knowledgeScore,
        reflectionScore,
        evolutionScore
      },
      recommendation: score >= 80 ? "skill is suitable for recommendation" : "skill should remain advisory until more evidence is available",
      safety: this.safety(),
      timestamp: nowIso()
    };
    this.append(evaluation);
    return evaluation;
  }

  append(item = {}) {
    const data = this.load();
    data.evaluations.push(item);
    this.writeJson(this.evaluationsFile, { evaluations: data.evaluations.slice(-300) });
  }

  load() {
    return this.readJson(this.evaluationsFile, { evaluations: [] });
  }

  safety() {
    return {
      skillManagementOnly: true,
      executesTool: false,
      bypassesToolSelector: false,
      bypassesVerifierCenter: false
    };
  }

  ensureStore() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.evaluationsFile)) this.writeJson(this.evaluationsFile, { evaluations: [] });
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

module.exports = { SkillEvaluator };
