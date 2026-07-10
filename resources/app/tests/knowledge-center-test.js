const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const { KnowledgeCenter } = require("../services/knowledge/knowledge-center");
const { KnowledgeIndexer } = require("../services/knowledge/knowledge-indexer");
const { KnowledgeRetriever } = require("../services/knowledge/knowledge-retriever");
const { KnowledgeAnalyzer } = require("../services/knowledge/knowledge-analyzer");
const { ExperienceCenter } = require("../services/experience/experience-center");
const { PlannerAgent } = require("../services/planner-agent");

function root(name) {
  const dir = path.join("D:\\BaiQiuAI", "data", "knowledge-tests", `run-${process.pid}`, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function run() {
  const knowledgeRoot = root("knowledge");
  const knowledgeCenter = new KnowledgeCenter({ rootDir: knowledgeRoot });
  const indexer = new KnowledgeIndexer({ knowledgeCenter });
  const retriever = new KnowledgeRetriever({ knowledgeCenter, indexer });

  const calculator = knowledgeCenter.addKnowledge({
    type: "task",
    source: "制作一个计算器",
    taskType: "dev.code.calculator",
    toolId: "calculator_creator",
    capability: "calculator",
    result: "created",
    successRate: 0.99,
    successCount: 99,
    failCount: 1
  });
  knowledgeCenter.addKnowledge({
    type: "task",
    source: "打开计算器",
    taskType: "dev.code.calculator",
    toolId: "browser_open",
    capability: "browser",
    result: "opened",
    successRate: 0.98,
    successCount: 98,
    failCount: 2
  });
  assert(calculator.id, "calculator knowledge should have id");

  const built = indexer.buildIndex();
  assert(built.index.tasks["dev.code.calculator"].tools.includes("calculator_creator"));
  assert(built.index.tasks["dev.code.calculator"].tools.includes("browser_open"));

  const hints = retriever.retrieve({ taskType: "dev.code.calculator", task: "制作一个计算器" });
  assert(hints.similarTasks >= 1, "planner should find similar task knowledge");
  assert(hints.recommendedTools.includes("calculator_creator"), "calculator_creator should be recommended");
  assert(hints.recommendedTools.includes("browser_open"), "browser_open should be recommended");
  assert(hints.successRate > 0.9, "success rate should be high");

  const planner = new PlannerAgent({ knowledgeRetriever: retriever });
  const plan = planner.createPlan({
    text: "制作一个计算器",
    primaryIntent: "dev.code.calculator",
    intents: [{ intent: "dev.code.calculator", clause: "制作一个计算器" }]
  }, { sessionId: "knowledge-test" });
  assert(plan.knowledgeHints.recommendedTools.includes("calculator_creator"), "Planner should expose knowledgeHints");

  const experienceRoot = root("experience");
  const experienceCenter = new ExperienceCenter({ rootDir: experienceRoot, knowledgeCenter });
  const exp = experienceCenter.record({
    taskType: "dev.code",
    toolId: "browser_open",
    errorType: "browser_missing",
    failedReason: "Edge missing",
    solution: "open_path",
    success: true
  });
  assert(exp, "successful experience should be recorded");
  const synced = knowledgeCenter.queryKnowledge({ type: "experience", toolId: "browser_open" });
  assert(synced.some((item) => item.experience === "browser_missing -> open_path"), "experience should sync to knowledge");

  const beforeFailure = knowledgeCenter.queryKnowledge({ toolId: "browser_open" }).length;
  const failed = experienceCenter.record({
    taskType: "dev.code",
    toolId: "browser_open",
    errorType: "fatal",
    failedReason: "fatal",
    solution: "abort",
    success: false
  });
  const afterFailure = knowledgeCenter.queryKnowledge({ toolId: "browser_open" }).length;
  assert.strictEqual(failed, null, "failed experience should not be recorded");
  assert.strictEqual(afterFailure, beforeFailure, "failed experience should not increase knowledge weight");

  const old = knowledgeCenter.addKnowledge({
    type: "task",
    source: "old failing task",
    taskType: "old.task",
    toolId: "old_tool",
    successRate: 0.4,
    successCount: 4,
    failCount: 6,
    timestamp: "2025-01-01T00:00:00.000Z"
  });
  const analyzer = new KnowledgeAnalyzer({
    knowledgeCenter,
    now: () => new Date("2026-07-10T00:00:00.000Z").getTime()
  });
  const analysis = analyzer.analyze();
  const oldAnalysis = analysis.find((item) => item.id === old.id);
  assert(oldAnalysis.outdated, "old knowledge should be outdated");
  assert(oldAnalysis.lowQuality, "successRate < 50% should lower weight");

  const rebuilt = indexer.buildIndex();
  assert(rebuilt.relations.some((item) => item.type === "task_tool" && item.to === "calculator_creator"));
  assert(rebuilt.relations.some((item) => item.type === "failure_solution" && item.to === "open_path"));
  assert(fs.existsSync(path.join(knowledgeRoot, "knowledge.json")));
  assert(fs.existsSync(path.join(knowledgeRoot, "index.json")));
  assert(fs.existsSync(path.join(knowledgeRoot, "relations.json")));

  return {
    ok: true,
    cases: [
      "add_calculator_knowledge",
      "planner_queries_history",
      "best_tool_combo",
      "experience_syncs_to_knowledge",
      "failed_experience_no_weight",
      "outdated_detection",
      "relation_index_generated"
    ]
  };
}

if (require.main === module) console.log(JSON.stringify(run(), null, 2));

module.exports = { run };
