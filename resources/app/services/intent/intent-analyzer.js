const fs = require("node:fs");
const path = require("node:path");
const { KnowledgeRetriever } = require("../knowledge/knowledge-retriever");
const { AgentIdentityCenter } = require("../identity/agent-identity-center");
const { ReflectionMemory } = require("../reflection/reflection-memory");
const { AutonomyLevelManager, DEFAULT_AUTONOMY_ROOT } = require("../autonomy/autonomy-level-manager");
const { ContextInterpreter } = require("./context-interpreter");
const { GoalUnderstandingEngine } = require("./goal-understanding-engine");
const { IntentMemory, DEFAULT_INTENT_ROOT } = require("./intent-memory");

function nowIso() {
  return new Date().toISOString();
}

class IntentAnalyzer {
  constructor({
    rootDir = DEFAULT_INTENT_ROOT,
    knowledgeRetriever = null,
    identityCenter = null,
    reflectionMemory = null,
    autonomyLevelManager = null,
    contextInterpreter = null,
    goalUnderstandingEngine = null,
    intentMemory = null
  } = {}) {
    this.rootDir = rootDir;
    this.analysesFile = path.join(rootDir, "intent-analyses.json");
    this.knowledgeRetriever = knowledgeRetriever || new KnowledgeRetriever();
    this.identityCenter = identityCenter || new AgentIdentityCenter();
    this.reflectionMemory = reflectionMemory || new ReflectionMemory();
    this.autonomyLevelManager = autonomyLevelManager || new AutonomyLevelManager({ rootDir: DEFAULT_AUTONOMY_ROOT });
    this.contextInterpreter = contextInterpreter || new ContextInterpreter({ identityCenter: this.identityCenter, reflectionMemory: this.reflectionMemory });
    this.goalUnderstandingEngine = goalUnderstandingEngine || new GoalUnderstandingEngine({ knowledgeRetriever: this.knowledgeRetriever });
    this.intentMemory = intentMemory || new IntentMemory({ rootDir });
    this.ensureStore();
  }

  analyze({ input = "", agentId = "default-agent", conversation = [] } = {}) {
    const context = this.contextInterpreter.interpret({ input, agentId, conversation });
    const intent = this.classifyIntent(input, context);
    const goal = this.goalUnderstandingEngine.understand({ input, intent: intent.intent, context });
    const autonomyLevel = this.autonomyLevelManager.getLevel(agentId);
    const memoryMatches = this.intentMemory.recall({ input, intent: intent.intent, taskType: goal.taskType });
    const analysis = {
      analysisId: `ia-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      agentId,
      input,
      intent: intent.intent,
      intentType: intent.intentType,
      confidence: this.combineConfidence(intent.confidence, goal.confidence, memoryMatches),
      goal,
      context,
      autonomy: {
        level: autonomyLevel.level,
        score: autonomyLevel.score,
        analysisOnly: true
      },
      memoryMatches,
      safety: {
        analysisOnly: true,
        executesTool: false,
        modifiesPermission: false,
        bypassesToolSelector: false,
        bypassesVerifierCenter: false
      },
      timestamp: nowIso()
    };
    this.intentMemory.record({
      agentId,
      input,
      intent: analysis.intent,
      goal: analysis.goal.goal,
      taskType: analysis.goal.taskType,
      confidence: analysis.confidence,
      contextSignals: analysis.context.signals
    });
    this.append(analysis);
    return analysis;
  }

  classifyIntent(input = "", context = {}) {
    const text = String(input || "");
    const lower = text.toLowerCase();
    if (/计算器|软件|html应用|应用/.test(text)) return { intent: "create_application", intentType: "task", confidence: 0.9 };
    if (/创建|新建/.test(text) && /文件夹|文件|txt/.test(text)) return { intent: "create_filesystem_item", intentType: "task", confidence: 0.88 };
    if (/学习|技能/.test(text)) return { intent: "learn_skill", intentType: "capability", confidence: 0.86 };
    if (/关闭电脑|关机|删除/.test(text)) return { intent: "high_risk_action", intentType: "task", confidence: 0.9 };
    if (/记住|名字叫|项目叫/.test(text)) return { intent: "memory_update", intentType: "memory", confidence: 0.85 };
    if (/我叫什么|项目叫什么/.test(text)) return { intent: "memory_query", intentType: "memory", confidence: 0.85 };
    if (/为什么|什么|怎么|解释|tell me|why|what/.test(lower) || context.signals?.includes("chat_or_question")) {
      return { intent: "chat_question", intentType: "chat", confidence: 0.75 };
    }
    if (/弄个|做个|搞个/.test(text)) return { intent: "clarification_required", intentType: "clarification", confidence: 0.7 };
    return { intent: "general_chat", intentType: "chat", confidence: 0.55 };
  }

  combineConfidence(intentConfidence = 0, goalConfidence = 0, memoryMatches = []) {
    const memoryBoost = memoryMatches.length ? Math.min(0.1, Number(memoryMatches[0].similarity || 0) * 0.1) : 0;
    return Math.min(0.99, Number(((Number(intentConfidence || 0) + Number(goalConfidence || 0)) / 2 + memoryBoost).toFixed(2)));
  }

  append(item = {}) {
    const data = this.load();
    data.analyses.push(item);
    this.writeJson(this.analysesFile, { analyses: data.analyses.slice(-500) });
  }

  load() {
    return this.readJson(this.analysesFile, { analyses: [] });
  }

  ensureStore() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.analysesFile)) this.writeJson(this.analysesFile, { analyses: [] });
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

module.exports = { IntentAnalyzer };
