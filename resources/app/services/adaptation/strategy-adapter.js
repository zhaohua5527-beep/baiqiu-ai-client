const fs = require("node:fs");
const path = require("node:path");
const { KnowledgeRetriever } = require("../knowledge/knowledge-retriever");
const { ReflectionMemory } = require("../reflection/reflection-memory");
const { AgentEvolutionEngine } = require("../evolution/agent-evolution-engine");
const { DEFAULT_ADAPTATION_ROOT } = require("./environment-detector");

function nowIso() {
  return new Date().toISOString();
}

class StrategyAdapter {
  constructor({
    rootDir = DEFAULT_ADAPTATION_ROOT,
    knowledgeRetriever = null,
    reflectionMemory = null,
    evolutionEngine = null
  } = {}) {
    this.rootDir = rootDir;
    this.strategiesFile = path.join(rootDir, "adaptive-strategies.json");
    this.knowledgeRetriever = knowledgeRetriever || new KnowledgeRetriever();
    this.reflectionMemory = reflectionMemory || new ReflectionMemory();
    this.evolutionEngine = evolutionEngine || new AgentEvolutionEngine();
    this.ensureStore();
  }

  adapt({ taskType = "", task = "", agentId = "default-agent", environment = {}, profile = {}, currentVersion = "unknown" } = {}) {
    const knowledgeHints = this.knowledgeRetriever.retrieve({ task, taskType });
    const reflectionHints = this.reflectionMemory.getHints({ taskType });
    const evolutionAdvice = this.evolutionEngine.generateEvolutionAdvice({ agentId, taskType, currentVersion });
    const strategies = this.buildStrategies({ environment, profile, knowledgeHints, reflectionHints, evolutionAdvice });
    const result = {
      taskType,
      task,
      agentId,
      profileId: profile.profileId || "",
      knowledgeHints,
      reflectionHints,
      evolutionAdvice: {
        evaluation: evolutionAdvice.evaluation,
        recommendations: evolutionAdvice.recommendations
      },
      strategies,
      selectedStrategy: strategies[0] || null,
      safety: {
        advisoryOnly: true,
        modifiesPermission: false,
        bypassesToolSelector: false,
        bypassesVerifierCenter: false
      },
      timestamp: nowIso()
    };
    this.append(result);
    return result;
  }

  buildStrategies({ environment = {}, profile = {}, knowledgeHints = {}, reflectionHints = {}, evolutionAdvice = {} } = {}) {
    const preferences = profile.strategyPreferences || {};
    const constraints = environment.constraints || {};
    const strategies = [];
    if (preferences.preferWorkspacePaths) {
      strategies.push({
        id: "prefer_workspace_paths",
        priority: 90,
        recommendation: "优先使用工作区安全路径，避免依赖未确认目录。",
        source: "environment_profile"
      });
    }
    if (constraints.lowMemory || preferences.preferLightweightPlan) {
      strategies.push({
        id: "lightweight_execution",
        priority: 80,
        recommendation: "优先选择步骤更少、资源占用更低的方案。",
        source: "environment_constraints"
      });
    }
    if (constraints.offline || preferences.avoidNetworkDependentSteps) {
      strategies.push({
        id: "offline_first",
        priority: 85,
        recommendation: "优先本地能力，避免依赖网络或外部服务。",
        source: "environment_constraints"
      });
    }
    if (Array.isArray(knowledgeHints.recommendedTools) && knowledgeHints.recommendedTools.length) {
      strategies.push({
        id: "knowledge_preferred_tools",
        priority: 70 + Math.round(Number(knowledgeHints.successRate || 0) * 20),
        recommendation: `参考历史成功工具：${knowledgeHints.recommendedTools.join(", ")}`,
        source: "knowledge"
      });
    }
    if (reflectionHints.available) {
      strategies.push({
        id: "reflection_improvement",
        priority: 75 + Math.round(Number(reflectionHints.confidence || 0) * 10),
        recommendation: reflectionHints.suggestion,
        source: "reflection"
      });
    }
    for (const item of evolutionAdvice.recommendations || []) {
      strategies.push({
        id: `evolution_${item.type}_${String(item.target || "general").replace(/[^a-zA-Z0-9_.-]/g, "_")}`,
        priority: 60 + Math.round(Number(item.confidence || 0) * 20),
        recommendation: item.suggestion,
        source: "evolution"
      });
    }
    if (!strategies.length) {
      strategies.push({
        id: "default_safe_strategy",
        priority: 50,
        recommendation: "保持现有安全执行链，继续通过 ToolSelector 与 VerifierCenter。",
        source: "default"
      });
    }
    return strategies.sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0));
  }

  append(item = {}) {
    const data = this.load();
    data.strategies.push(item);
    this.writeJson(this.strategiesFile, { strategies: data.strategies.slice(-300) });
  }

  load() {
    return this.readJson(this.strategiesFile, { strategies: [] });
  }

  ensureStore() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.strategiesFile)) this.writeJson(this.strategiesFile, { strategies: [] });
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

module.exports = { StrategyAdapter };
