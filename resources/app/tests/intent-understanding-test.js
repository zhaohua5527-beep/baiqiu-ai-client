const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const { IntentAnalyzer } = require("../services/intent/intent-analyzer");
const { GoalUnderstandingEngine } = require("../services/intent/goal-understanding-engine");
const { ContextInterpreter } = require("../services/intent/context-interpreter");
const { IntentMemory } = require("../services/intent/intent-memory");
const { KnowledgeCenter } = require("../services/knowledge/knowledge-center");
const { KnowledgeIndexer } = require("../services/knowledge/knowledge-indexer");
const { KnowledgeRetriever } = require("../services/knowledge/knowledge-retriever");
const { AgentIdentityCenter } = require("../services/identity/agent-identity-center");
const { ReflectionMemory } = require("../services/reflection/reflection-memory");
const { AutonomyLevelManager } = require("../services/autonomy/autonomy-level-manager");

function root(name) {
  const dir = path.join("D:\\BaiQiuAI", "data", "intent-tests", `run-${process.pid}`, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function run() {
  const intentRoot = root("intent");
  const knowledgeRoot = root("knowledge");
  const identityRoot = root("identity");
  const reflectionRoot = root("reflection");
  const autonomyRoot = root("autonomy");

  const knowledgeCenter = new KnowledgeCenter({ rootDir: knowledgeRoot });
  knowledgeCenter.addKnowledge({
    type: "task",
    taskType: "dev.code.calculator",
    toolId: "calculator_creator",
    capability: "calculator_application_creation",
    successRate: 0.99,
    successCount: 50,
    failCount: 1
  });
  new KnowledgeIndexer({ knowledgeCenter }).buildIndex();
  const knowledgeRetriever = new KnowledgeRetriever({ knowledgeCenter });

  const identityCenter = new AgentIdentityCenter({ rootDir: identityRoot });
  identityCenter.registerAgent({
    agentId: "planner-agent",
    profile: {
      name: "Planner Agent",
      role: "planner",
      capabilities: ["intent", "planning"]
    }
  });

  const reflectionMemory = new ReflectionMemory({ rootDir: reflectionRoot });
  reflectionMemory.record({
    taskType: "dev.code.calculator",
    status: "success",
    reason: "stable calculator understanding",
    improvement: "calculator requests should include create and open requirements",
    confidence: 0.95
  });

  const autonomyLevelManager = new AutonomyLevelManager({ rootDir: autonomyRoot });
  autonomyLevelManager.setLevel("planner-agent", "supervised", "intent test");

  const contextInterpreter = new ContextInterpreter({ identityCenter, reflectionMemory });
  const context = contextInterpreter.interpret({
    input: "帮我创建一个文件夹，里面放三个文本文件，然后打开",
    agentId: "planner-agent",
    taskType: "file.folder"
  });
  assert.strictEqual(context.identityKnown, true);
  assert(context.signals.includes("multi_step"));
  assert(context.signals.includes("quantity"));
  assert(context.signals.includes("spatial_relation"));

  const goalEngine = new GoalUnderstandingEngine({ knowledgeRetriever });
  const calculatorGoal = goalEngine.understand({
    input: "做一个计算器软件然后打开",
    intent: "create_application",
    context
  });
  assert.strictEqual(calculatorGoal.taskType, "dev.code.calculator");
  assert(calculatorGoal.requirements.includes("generate app"));
  assert(calculatorGoal.requirements.includes("open result"));
  assert(calculatorGoal.knowledgeHints.recommendedTools.includes("calculator_creator"));
  assert.strictEqual(calculatorGoal.safety.executesTool, false);

  const intentMemory = new IntentMemory({ rootDir: intentRoot });
  const firstRecord = intentMemory.record({
    agentId: "planner-agent",
    input: "做一个计算器软件然后打开",
    intent: "create_application",
    goal: "create calculator application",
    taskType: "dev.code.calculator",
    confidence: 0.9
  });
  assert(firstRecord.intentId);
  assert(intentMemory.recall({ input: "计算器软件打开", intent: "create_application" }).length >= 1);

  const analyzer = new IntentAnalyzer({
    rootDir: intentRoot,
    knowledgeRetriever,
    identityCenter,
    reflectionMemory,
    autonomyLevelManager,
    contextInterpreter,
    goalUnderstandingEngine: goalEngine,
    intentMemory
  });

  const calculator = analyzer.analyze({
    input: "帮我写一个计算器软件放桌面，然后打开",
    agentId: "planner-agent"
  });
  assert.strictEqual(calculator.intent, "create_application");
  assert.strictEqual(calculator.goal.taskType, "dev.code.calculator");
  assert(calculator.goal.requirements.includes("desktop target"));
  assert.strictEqual(calculator.autonomy.level, "supervised");
  assert.strictEqual(calculator.safety.executesTool, false);

  const memoryUpdate = analyzer.analyze({
    input: "我的项目叫白球AI",
    agentId: "planner-agent"
  });
  assert.strictEqual(memoryUpdate.intent, "memory_update");
  assert.strictEqual(memoryUpdate.goal.taskType, "memory.query_or_update");

  const highRisk = analyzer.analyze({
    input: "帮我关闭电脑",
    agentId: "planner-agent"
  });
  assert.strictEqual(highRisk.intent, "high_risk_action");
  assert.strictEqual(highRisk.goal.expectedOutcome, "confirm_required");
  assert(highRisk.context.signals.includes("high_risk_possible"));

  const ambiguous = analyzer.analyze({
    input: "弄个小工具",
    agentId: "planner-agent"
  });
  assert.strictEqual(ambiguous.intent, "clarification_required");

  const serialized = JSON.stringify([calculator, memoryUpdate, highRisk, ambiguous]);
  assert(!serialized.includes("ToolSelector.execute"), "intent layer must not bypass ToolSelector");
  assert(!serialized.includes("VerifierCenter.verify"), "intent layer must not bypass VerifierCenter");
  assert(!serialized.includes("PermissionManager.allowAll"), "intent layer must not alter permissions");

  assert(fs.existsSync(path.join(intentRoot, "intent-analyses.json")));
  assert(fs.existsSync(path.join(intentRoot, "intent-memory.json")));
  assert(fs.existsSync(path.join(intentRoot, "intent-patterns.json")));

  return {
    ok: true,
    cases: [
      "intent_analyzer_classifies_user_input",
      "goal_understanding_engine_extracts_requirements",
      "context_interpreter_reads_identity_reflection",
      "intent_memory_records_and_recalls",
      "intent_layer_reads_autonomy_level",
      "intent_layer_no_execution_bypass"
    ]
  };
}

if (require.main === module) console.log(JSON.stringify(run(), null, 2));

module.exports = { run };
