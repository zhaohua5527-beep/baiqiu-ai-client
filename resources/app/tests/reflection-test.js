const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const { ReflectionEngine } = require("../services/reflection/reflection-engine");
const { FailureAnalyzer } = require("../services/reflection/failure-analyzer");
const { DecisionReviewer } = require("../services/reflection/decision-reviewer");
const { ReflectionMemory } = require("../services/reflection/reflection-memory");
const { MetaLearningCenter } = require("../services/meta-learning/meta-learning-center");
const { PlannerAgent } = require("../services/planner-agent");

function root(name) {
  const dir = path.join("D:\\BaiQiuAI", "data", "reflection-tests", `run-${process.pid}`, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function run() {
  const reflectionRoot = root("reflection");
  const metaRoot = root("meta");
  const reflectionMemory = new ReflectionMemory({ rootDir: reflectionRoot });
  const metaLearningCenter = new MetaLearningCenter({ rootDir: metaRoot });
  const engine = new ReflectionEngine({ reflectionMemory, metaLearningCenter });

  const success = engine.reflect({
    taskType: "dev.code.calculator",
    status: "success",
    verification: { status: "passed" },
    plan: {
      primaryIntent: "dev.code.calculator",
      steps: [
        { id: "step-1", toolId: "calculator_creator", args: { message: "calculator" } }
      ],
      reasoningResult: { selectedPlan: { id: "calculator_direct", tools: ["calculator_creator"] } }
    },
    duration: 1000
  });
  assert.strictEqual(success.status, "success", "success task should produce reflection");
  assert(success.reflection.includes("\u6210\u529f"), "success reflection should mention success");
  assert(success.memory, "success reflection should be stored");
  assert(success.metaLearning, "verified success should sync to MetaLearning");

  const failureAnalyzer = new FailureAnalyzer();
  const invalidPath = failureAnalyzer.analyze({
    status: "failed",
    errorType: "invalid_path",
    reason: "invalid_path"
  });
  assert.strictEqual(invalidPath.type, "invalid_path");
  assert.strictEqual(invalidPath.reason, "\u8def\u5f84\u7b56\u7565\u9519\u8bef");
  assert.strictEqual(invalidPath.suggestion, "\u4f7f\u7528workspace\u5b89\u5168\u8def\u5f84");

  const redundant = failureAnalyzer.detectRedundantSteps({
    calculatorCreatorOpened: true,
    steps: [
      { toolId: "calculator_creator" },
      { toolId: "browser_open" }
    ]
  });
  assert.strictEqual(redundant.redundant, true, "calculator_creator + browser_open should be redundant when calculator already opened");

  const permission = engine.reflect({
    taskType: "system.shutdown",
    status: "failed",
    errorType: "permission_denied",
    verification: { status: "failed", reason: "permission_denied" },
    plan: {
      primaryIntent: "system.shutdown",
      steps: [{ id: "shutdown", toolId: "system_shutdown", needUserConfirm: true }]
    }
  });
  assert.strictEqual(permission.memory, null, "permission failures should not enter reflection memory");
  assert.strictEqual(permission.metaLearning, null, "permission failures should not affect strategy optimization");
  assert.strictEqual(metaLearningCenter.getHints({ taskType: "system.shutdown" }).available, false, "system_shutdown should not become auto-optimized");

  const fatal = reflectionMemory.record({
    taskType: "file.create",
    mistake: "fatal",
    reason: "fatal",
    improvement: "none",
    errorType: "fatal"
  });
  assert.strictEqual(fatal, null, "fatal should not be stored");

  const reviewer = new DecisionReviewer();
  const review = reviewer.review({
    steps: [
      { id: "a", toolId: "file_creator", args: { path: "{{step1.file}}" }, dependsOn: [] },
      { id: "b", toolId: "file_creator", args: { path: "{{step1.file}}" }, dependsOn: [] }
    ]
  });
  assert(review.issues.some((item) => item.type === "missing_dependency"), "reviewer should detect missing dependency");
  assert(review.issues.some((item) => item.type === "duplicate_tool"), "reviewer should detect duplicate tool");

  reflectionMemory.record({
    taskType: "dev.code.calculator",
    reason: "redundant",
    improvement: "\u51cf\u5c11browser_open\u6b65\u9aa4",
    confidence: 0.9,
    status: "success"
  });
  const planner = new PlannerAgent({ reflectionMemory, metaLearningCenter });
  const plan = planner.createPlan({
    text: "帮我写一个计算器软件放桌面，然后打开",
    primaryIntent: "dev.code.calculator",
    intents: [{ intent: "dev.code.calculator", clause: "帮我写一个计算器软件放桌面，然后打开" }],
    isMultiStep: true
  }, { sessionId: "reflection-test" });
  assert(plan.reflectionHints.available, "Planner should expose reflectionHints");
  assert.strictEqual(plan.steps[0].toolId, "calculator_creator", "reflection hints must not bypass normal planning");

  assert(fs.existsSync(path.join(reflectionRoot, "reflections.json")));
  assert(fs.existsSync(path.join(reflectionRoot, "mistakes.json")));
  assert(fs.existsSync(path.join(reflectionRoot, "improvements.json")));

  return {
    ok: true,
    cases: [
      "success_reflection_generated",
      "invalid_path_failure_analyzed",
      "redundant_step_detected",
      "permission_failure_isolated",
      "planner_reflection_hints"
    ]
  };
}

if (require.main === module) console.log(JSON.stringify(run(), null, 2));

module.exports = { run };
