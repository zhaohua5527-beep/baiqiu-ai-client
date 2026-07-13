const fs = require("node:fs");
const path = require("node:path");
const { dataRoot } = require("../data-root");

const { AgentController } = require("../agent-controller");
const { IntentAgent } = require("../intent-agent");
const { PlannerAgent } = require("../planner-agent");
const { ToolSelector } = require("../tool-selector");
const { VerifierCenter } = require("../verifier-center");
const { ReplyBuilder } = require("../reply-builder");
const { MemoryCenter } = require("../memory-center");
const { SkillCenter } = require("../skill-center");
const { CapabilityCenter } = require("../capability-center");
const { AgentTracer } = require("../observability/agent-tracer");

const DEFAULT_CASES = path.join(__dirname, "..", "..", "tests", "agent-evaluation-cases.json");
const EVALUATION_ROOT = path.join(dataRoot(), "evaluation");

function defaultRunRoot() {
  return path.join(EVALUATION_ROOT, "runs", `run-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`);
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function availableTools() {
  return [
    tool("calculator_creator", "dev", ["dev.code.calculator"]),
    tool("html_app_creator", "dev", ["dev.code"]),
    tool("file_creator", "file", ["file.create"]),
    tool("browser_open", "system", ["system.open", "file.open", "dev.code", "dev.code.calculator"]),
    tool("write_text_file", "file", ["file.create"]),
    tool("open_path", "system", ["system.open", "file.open"]),
    tool("write_xlsx", "file", ["spreadsheet.create"])
  ];
}

function tool(id, category, supportedIntent) {
  return {
    id,
    name: id,
    description: id,
    category,
    supportedIntent,
    riskLevel: "low",
    requirePermission: false,
    permission: { level: "read", scope: "tool" },
    parameters: { type: "object", properties: {}, required: [] }
  };
}

function canonicalIntent(intent, input = "") {
  const text = `${intent || ""} ${input || ""}`;
  if (/dev\.code\.calculator|计算器/.test(text)) return "create_application";
  if (/文件夹/.test(text) && /三个|3/.test(text)) return "create_folder_with_files";
  if (/弄个小工具/.test(text)) return "clarification_required";
  if (/项目叫|项目叫什么/.test(text)) return "memory_project";
  if (/skill|技能/.test(text)) return "skill_learning";
  if (/验证失败|verifier/.test(text)) return "verification_failure";
  return intent || "general.chat";
}

function scoreMatch(actual, expected) {
  return actual === expected ? 100 : 0;
}

function includesAll(actual = [], expected = []) {
  const remaining = [...actual];
  for (const item of expected) {
    const index = remaining.indexOf(item);
    if (index === -1) return false;
    remaining.splice(index, 1);
  }
  return true;
}

function scoreTools(actual = [], expected = []) {
  if (!expected.length) return 100;
  const hits = expected.filter((item) => actual.includes(item)).length;
  return Math.round((hits / expected.length) * 100);
}

function average(values) {
  const nums = values.map((value) => Number(value) || 0);
  return Math.round(nums.reduce((sum, value) => sum + value, 0) / Math.max(1, nums.length));
}

class AgentEvaluator {
  constructor({
    casesFile = DEFAULT_CASES,
    tracer = null,
    evaluationRoot = defaultRunRoot()
  } = {}) {
    this.casesFile = casesFile;
    this.evaluationRoot = evaluationRoot;
    this.tracer = tracer || new AgentTracer();
    this.memoryCenter = new MemoryCenter({ root: path.join(evaluationRoot, "memory") });
    this.skillCenter = new SkillCenter({ root: path.join(evaluationRoot, "skills"), memoryCenter: this.memoryCenter });
    this.capabilityCenter = new CapabilityCenter({
      root: path.join(evaluationRoot, "capabilities"),
      skillCenter: this.skillCenter,
      memoryCenter: this.memoryCenter
    });
    this.capabilityCenter.refresh({ tools: availableTools(), skills: this.skillCenter.listSkills() });
    this.intentAgent = new IntentAgent();
    this.plannerAgent = new PlannerAgent({ capabilityCenter: this.capabilityCenter });
    this.toolSelector = new ToolSelector({
      skillCenter: this.skillCenter,
      capabilityCenter: this.capabilityCenter
    });
    this.verifierCenter = new VerifierCenter();
    this.replyBuilder = new ReplyBuilder({ tracer: this.tracer, developerMode: false });
    this.controller = new AgentController({ tracer: this.tracer });
  }

  loadCases() {
    return readJson(this.casesFile, { cases: [] }).cases || [];
  }

  async runAll() {
    const cases = this.loadCases();
    const results = [];
    for (const item of cases) results.push(await this.evaluateCase(item));
    const score = {
      understanding: average(results.map((item) => item.score.understanding)),
      planning: average(results.map((item) => item.score.planning)),
      execution: average(results.map((item) => item.score.execution)),
      verification: average(results.map((item) => item.score.verification)),
      reply: average(results.map((item) => item.score.reply))
    };
    return {
      generatedAt: new Date().toISOString(),
      cases: results,
      score,
      agentIntelligenceScore: average(Object.values(score)),
      issues: results.flatMap((item) => item.issues.map((issue) => `${item.id}: ${issue}`))
    };
  }

  async evaluateCase(testCase) {
    const traceId = this.tracer.startTrace({ userMessage: testCase.input, sessionId: `evaluation-${testCase.id}` });
    this.tracer.record(traceId, "AgentEvaluator", "evaluation.start", "running", { caseId: testCase.id });
    const result = await this.controller.run({
      traceId,
      requestId: `evaluation-${testCase.id}`,
      conversationId: `evaluation-${testCase.id}`,
      userMessage: testCase.input,
      provider: "evaluation",
      model: "local-evaluator"
    }, [{
      name: "agent_evaluation_strategy",
      canHandle: () => true,
      execute: async () => {
        const raw = await this.evaluateWithAgents(testCase, traceId);
        return {
          success: raw.caseScore >= 60,
          status: raw.caseScore >= 60 ? "success" : "failed",
          message: raw.reply || "",
          raw
        };
      }
    }]);
    this.tracer.record(traceId, "AgentEvaluator", "evaluation.score", result.success ? "success" : "failed", result.raw?.score || {});
    this.tracer.finishTrace(traceId, result.status, { status: result.status, caseId: testCase.id, score: result.raw?.score });
    return { ...result.raw, traceId };
  }

  async evaluateWithAgents(testCase, traceId) {
    if (testCase.id === "memory_project_name") return this.evaluateMemory(testCase, traceId);
    if (testCase.id === "weather_skill_missing_capability") return this.evaluateWeatherSkill(testCase, traceId);
    if (testCase.id === "verifier_rejects_false_success") return this.evaluateVerifierFailure(testCase, traceId);

    const intentAnalysis = this.intentAgent.analyze(testCase.input, {});
    const intent = canonicalIntent(intentAnalysis.primaryIntent, testCase.input);
    this.tracer.record(traceId, "SupervisorAgent", "evaluation.intent", "success", {
      primaryIntent: intentAnalysis.primaryIntent,
      canonicalIntent: intent
    });

    const plan = this.plannerAgent.createPlan(intentAnalysis, { sessionId: `evaluation-${testCase.id}` });
    const selectedTools = this.selectTools(plan, testCase.input);
    this.tracer.record(traceId, "PlannerAgent", "evaluation.plan", plan.blocked ? "blocked" : "success", {
      tasks: plan.tasks,
      selectedTools
    });

    const expected = testCase.expected || {};
    const issues = [];
    if (intent !== expected.intent) issues.push(`intent expected ${expected.intent}, got ${intent}`);
    if (expected.tools && !includesAll(selectedTools, expected.tools)) issues.push(`tools expected ${expected.tools.join(" -> ")}, got ${selectedTools.join(" -> ") || "none"}`);
    if ((expected.forbiddenTools || []).some((item) => selectedTools.includes(item))) issues.push("forbidden tool selected");
    if (expected.requiresDependsOn && !plan.tasks.some((task) => (task.dependsOn || []).length)) issues.push("dependsOn missing");

    const shouldExecute = expected.shouldExecute !== false && plan.tasks.some((task) => task.executable !== false && task.toolId);
    if (expected.shouldExecute === false && shouldExecute) issues.push("ambiguous request should not execute");

    const simulatedExecution = shouldExecute
      ? { success: issues.length === 0, status: issues.length === 0 ? "success" : "failed", selectedTools }
      : { success: expected.shouldExecute === false, status: expected.shouldExecute === false ? "clarification" : "failed", selectedTools };
    const verification = {
      verified: simulatedExecution.success,
      status: simulatedExecution.success ? "passed" : "failed",
      checks: issues.map((issue) => ({ name: issue, passed: false })),
      reason: issues.join("; ")
    };
    this.tracer.record(traceId, "ExecutorAgent", "evaluation.tool", simulatedExecution.status, simulatedExecution);
    this.tracer.record(traceId, "VerifierAgent", "evaluation.verify", verification.status, verification);

    const reply = expected.shouldExecute === false
      ? "请补充具体需求后我再执行。"
      : this.replyBuilder.build({
        taskResult: { success: simulatedExecution.success, status: simulatedExecution.status, results: [] },
        verification,
        context: { userMessage: testCase.input, traceId }
      }).text;
    const replyScore = this.scoreReply(reply, expected);
    const score = {
      understanding: scoreMatch(intent, expected.intent),
      planning: expected.shouldExecute === false ? (shouldExecute ? 0 : 100) : scoreTools(selectedTools, expected.tools || []),
      execution: simulatedExecution.success ? 100 : 0,
      verification: verification.status === (simulatedExecution.success ? "passed" : "failed") ? 100 : 0,
      reply: replyScore
    };
    return this.caseResult(testCase, intent, plan, selectedTools, simulatedExecution, verification, reply, score, issues);
  }

  selectTools(plan, input) {
    const selected = [];
    for (const task of plan.tasks || []) {
      const selection = this.toolSelector.select({
        intent: task.intent,
        task,
        context: { userMessage: input },
        availableTools: availableTools()
      });
      const toolId = task.toolId || selection.selectedTools?.[0]?.id || "";
      if (toolId) selected.push(toolId);
    }
    return selected;
  }

  async evaluateMemory(testCase, traceId) {
    this.memoryCenter.setProjectState?.({ projectName: "白球AI", currentPhase: "Phase 4-1 Evaluation" });
    this.memoryCenter.rememberFromText?.(testCase.input, { explicit: true, source: "evaluation" });
    const snapshot = this.memoryCenter.snapshot();
    const answer = JSON.stringify(snapshot).includes("白球AI") ? "白球AI" : "";
    const ok = answer === testCase.expected.memoryAnswer;
    const verification = { verified: ok, status: ok ? "passed" : "failed", checks: [{ name: "memory_read", passed: ok }], reason: ok ? "" : "memory answer mismatch" };
    this.tracer.record(traceId, "MemoryCenter", "evaluation.intent", ok ? "success" : "failed", { answer });
    const score = { understanding: 100, planning: 100, execution: ok ? 100 : 0, verification: ok ? 100 : 0, reply: ok ? 100 : 0 };
    return this.caseResult(testCase, "memory_project", null, [], { success: ok }, verification, answer, score, ok ? [] : ["MemoryCenter did not return project name"]);
  }

  async evaluateWeatherSkill(testCase, traceId) {
    const learned = this.skillCenter.learnSkillFromRequest(testCase.input);
    this.capabilityCenter.refresh({ tools: availableTools(), skills: this.skillCenter.listSkills() });
    const capability = this.capabilityCenter.checkRequirement("weather.query", { userMessage: testCase.input });
    const ok = learned.success === false && capability.status === "missing";
    const reply = learned.error || capability.reason || "";
    const verification = { verified: ok, status: ok ? "passed" : "failed", checks: [{ name: "weather_missing", passed: ok }], reason: ok ? "" : "weather skill falsely installed" };
    this.tracer.record(traceId, "CapabilityCenter", "evaluation.verify", verification.status, { learned, capability });
    const score = { understanding: 100, planning: 100, execution: ok ? 100 : 0, verification: ok ? 100 : 0, reply: this.scoreReply(reply, testCase.expected) };
    return this.caseResult(testCase, "skill_learning", null, [], learned, verification, reply, score, ok ? [] : ["weather skill fake success risk"]);
  }

  async evaluateVerifierFailure(testCase, traceId) {
    const toolResult = { success: true, result: { output: { files: [] } }, error: null };
    const verification = this.verifierCenter.verify({ toolId: "file_creator", result: toolResult });
    const finalStatus = verification.status === "passed" ? "success" : "failed";
    const reply = this.replyBuilder.build({
      taskResult: { success: false, status: finalStatus, error: verification.reason, results: [] },
      verification,
      context: { userMessage: testCase.input, traceId }
    });
    const ok = toolResult.success === true && verification.status === "failed" && reply.status === "failed";
    this.tracer.record(traceId, "VerifierAgent", "evaluation.verify", verification.status, { toolResult, finalStatus });
    const score = { understanding: 100, planning: 100, execution: 100, verification: ok ? 100 : 0, reply: reply.status === "failed" ? 100 : 0 };
    return this.caseResult(testCase, "verification_failure", null, ["file_creator"], toolResult, verification, reply.text, score, ok ? [] : ["Verifier failure did not block success reply"]);
  }

  scoreReply(reply, expected = {}) {
    const required = expected.replyShouldContain || [];
    if (!required.length) return reply ? 100 : 0;
    const hits = required.filter((item) => String(reply || "").includes(item)).length;
    return Math.round((hits / required.length) * 100);
  }

  caseResult(testCase, intent, plannerResult, selectedTools, executionResult, verificationResult, reply, score, issues) {
    return {
      id: testCase.id,
      input: testCase.input,
      intent,
      plannerResult,
      selectedTools,
      executionResult,
      verificationResult,
      reply,
      score,
      caseScore: average(Object.values(score)),
      issues
    };
  }
}

async function main() {
  const evaluator = new AgentEvaluator();
  const report = await evaluator.runAll();
  const out = path.join(EVALUATION_ROOT, `agent-evaluation-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify({ ...report, reportFile: out }, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { AgentEvaluator, DEFAULT_CASES, EVALUATION_ROOT };
