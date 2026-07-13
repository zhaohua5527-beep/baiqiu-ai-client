const fs = require("node:fs");
const path = require("node:path");
const { dataRoot } = require("../data-root");

const { IntentAgent } = require("../intent-agent");
const { PlannerAgent } = require("../planner-agent");
const { TaskQueue } = require("../task-queue");
const { TaskOrchestrator } = require("../task-orchestrator");
const { ToolSelector } = require("../tool-selector");
const { ToolExecutionService } = require("../tool-execution-service");
const { VerifierCenter } = require("../verifier-center");
const { ReplyBuilder } = require("../reply-builder");
const { ExperienceCenter } = require("../experience/experience-center");
const { PerformanceTracker } = require("../optimization/performance-tracker");
const { StrategyOptimizer } = require("../optimization/strategy-optimizer");
const { BenchmarkEngine } = require("./benchmark-engine");
const { RegressionManager } = require("./regression-manager");
const { ToolRegistry } = require("../../tool-registry");

const SIMULATION_ROOT = path.join(dataRoot(), "simulation");

function runRoot() {
  return path.join(SIMULATION_ROOT, "runs", `run-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`);
}

function defaultScenarios() {
  return [
    { id: "calculator", task: "帮我写一个计算器软件放桌面，然后打开", expectedTools: ["calculator_creator", "browser_open"], expectedResult: "success", riskLevel: "medium" },
    { id: "file_create", task: "创建A.txt、B.txt、C.txt到桌面", expectedTools: ["file_creator"], expectedResult: "success", riskLevel: "medium" },
    { id: "html_app", task: "帮我创建一个HTML应用并打开", expectedTools: ["html_app_creator"], expectedResult: "success", riskLevel: "medium" },
    { id: "failure_recovery", task: "创建一个文件到非法路径", expectedTools: ["write_text_file"], expectedResult: "success", riskLevel: "medium", planOverride: "invalid_path" },
    { id: "permission", task: "关闭电脑", expectedTools: ["system_shutdown"], expectedResult: "success", riskLevel: "high" },
    { id: "skill", task: "学习一个全国天气查询技能", expectedTools: [], expectedResult: "blocked", riskLevel: "low" }
  ];
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function includesAll(actual = [], expected = []) {
  return expected.every((item) => actual.includes(item));
}

class ScenarioRunner {
  constructor({ scenariosFile = null, scenarios = null, root = runRoot() } = {}) {
    this.root = root;
    this.scenariosFile = scenariosFile;
    this.scenarios = scenarios;
    fs.mkdirSync(root, { recursive: true });
    this.benchmarkEngine = new BenchmarkEngine();
    this.regressionManager = new RegressionManager({ rootDir: root });
    this.intentAgent = new IntentAgent();
    this.experienceCenter = new ExperienceCenter({ rootDir: path.join(root, "experience") });
    this.performanceTracker = new PerformanceTracker({ rootDir: path.join(root, "optimization") });
    this.strategyOptimizer = new StrategyOptimizer({
      performanceTracker: this.performanceTracker,
      experienceCenter: this.experienceCenter
    });
  }

  loadScenarios() {
    if (Array.isArray(this.scenarios)) return this.scenarios;
    if (this.scenariosFile) return readJson(this.scenariosFile, { scenarios: [] }).scenarios || [];
    return defaultScenarios();
  }

  async runAll() {
    const scenarios = this.loadScenarios();
    const results = [];
    for (const scenario of scenarios) results.push(await this.runScenario(scenario));
    const benchmark = this.benchmarkEngine.summarize(results);
    const report = {
      generatedAt: new Date().toISOString(),
      root: this.root,
      results,
      benchmark
    };
    const regression = this.regressionManager.compare(report);
    report.regression = regression;
    fs.writeFileSync(path.join(this.root, "benchmark-report.json"), JSON.stringify(report, null, 2), "utf8");
    return report;
  }

  async runScenario(scenario = {}) {
    const startedAt = Date.now();
    const db = { queue: [] };
    const registry = this.createRegistry(scenario);
    const selector = new ToolSelector({ strategyOptimizer: this.strategyOptimizer });
    const verifier = new VerifierCenter();
    const executionService = new ToolExecutionService({
      registry,
      selector,
      verifier,
      withTimeout: (promise) => Promise.resolve(promise)
    });
    const orchestrator = new TaskOrchestrator({
      taskQueue: new TaskQueue({ loadDb: () => db, saveDb: () => {} }),
      toolSelector: selector,
      toolRegistry: registry,
      toolExecutionService: executionService,
      replyBuilder: new ReplyBuilder({ developerMode: false }),
      experienceCenter: this.experienceCenter,
      performanceTracker: this.performanceTracker
    });

    const planObject = this.planForScenario(scenario);
    const selectedTools = (planObject.tasks || []).filter((task) => task.executable !== false && task.toolId).map((task) => task.toolId);
    let taskResult = null;
    if ((planObject.tasks || []).some((task) => task.executable !== false && task.toolId)) {
      taskResult = await orchestrator.execute({
        sessionId: `simulation-${scenario.id}`,
        message: scenario.task,
        planObject,
        contextPatch: { provider: "simulation" }
      });
    }

    const queue = orchestrator.taskQueue.list(`simulation-${scenario.id}`);
    const recoveryCount = queue.filter((task) => task.replan).length;
    const blocked = planObject.blocked || !(planObject.tasks || []).some((task) => task.executable !== false && task.toolId);
    const actualStatus = blocked ? "blocked" : (taskResult?.normalized?.success ? "success" : "failed");
    const toolMatch = includesAll(selectedTools, scenario.expectedTools || []);
    const resultMatch = scenario.expectedResult ? actualStatus === scenario.expectedResult : actualStatus !== "failed";
    const success = toolMatch && resultMatch;
    return {
      id: scenario.id,
      task: scenario.task,
      success,
      expectedResult: scenario.expectedResult || "",
      actualStatus,
      expectedTools: scenario.expectedTools || [],
      selectedTools,
      riskLevel: scenario.riskLevel || "",
      duration: Date.now() - startedAt,
      failureType: success ? "" : (toolMatch ? "result_mismatch" : "tool_mismatch"),
      recoveryCount,
      reply: taskResult?.text || "",
      plan: (planObject.tasks || []).map((task) => ({
        id: task.id,
        toolId: task.toolId,
        intent: task.intent,
        executable: task.executable !== false,
        riskLevel: task.riskLevel || ""
      }))
    };
  }

  planForScenario(scenario = {}) {
    if (scenario.planOverride === "invalid_path") {
      return {
        id: `simulation-${scenario.id}`,
        sourceText: scenario.task,
        primaryIntent: "file.create",
        tasks: [{
          id: "step-1.invalid_path",
          taskId: "step-1.invalid_path",
          title: "write invalid path",
          intent: "file.create",
          type: "tool",
          toolId: "write_text_file",
          args: { path: "D:\\Games\\simulation.txt", content: "simulation" },
          executable: true,
          retryLimit: 1,
          verifier: "file_creator"
        }]
      };
    }
    const planner = new PlannerAgent({
      experienceCenter: this.experienceCenter,
      strategyOptimizer: this.strategyOptimizer
    });
    const intent = this.intentAgent.analyze(scenario.task, {});
    return planner.createPlan(intent, { sessionId: `simulation-${scenario.id}` });
  }

  createRegistry(scenario = {}) {
    const registry = new ToolRegistry({ context: {}, logger: null });
    const register = (id, supportedIntent, handler, riskLevel = "low") => registry.register({
      id,
      name: id,
      description: id,
      category: id.includes("skill") ? "skill" : "simulation",
      supportedIntent,
      riskLevel,
      requirePermission: false,
      parameters: { type: "object", properties: {} },
      permission: { level: riskLevel === "high" ? "admin" : "read", scope: "simulation" },
      execute: async (params) => handler(params)
    });
    register("calculator_creator", ["dev.code.calculator"], () => {
      const file = path.join(this.root, "apps", "calculator.html");
      this.writeFile(file, this.calculatorHtml());
      return { success: true, result: { output: { file, openUrl: `file:///${file.replace(/\\/g, "/")}`, opened: true, browserVerified: true } } };
    }, "medium");
    register("html_app_creator", ["dev.code"], () => {
      const file = path.join(this.root, "apps", "app.html");
      this.writeFile(file, this.htmlApp());
      return { success: true, result: { output: { file, openUrl: `file:///${file.replace(/\\/g, "/")}`, opened: { url: `file:///${file.replace(/\\/g, "/")}`, verifiedProcess: true } } } };
    }, "medium");
    register("file_creator", ["file.create"], () => {
      const file = path.join(this.root, "files", "A.txt");
      this.writeFile(file, "simulation file\n");
      return { success: true, result: { output: { files: [{ file }] } } };
    }, "medium");
    register("write_text_file", ["file.create"], (params) => {
      if (scenario.planOverride === "invalid_path" && String(params.path || "").startsWith("D:\\Games")) {
        return { success: false, error: "path not allowed" };
      }
      return { success: true, result: { path: params.path || path.join(this.root, "files", "simulation.txt") } };
    }, "medium");
    register("create_folder", ["file.create", "folder.create"], (params) => ({ success: true, result: { path: params.path || path.join(this.root, "folder"), folder: params.path || path.join(this.root, "folder") } }));
    register("browser_open", ["system.open", "file.open", "dev.code", "dev.code.calculator"], (params) => ({ success: true, result: { output: { file: params.path || "", target: params.path || params.url || "simulation://open", url: params.url || params.path || "simulation://open", opened: true, verifiedProcess: true, openUrl: params.path || params.url || "simulation://open" } } }));
    register("open_path", ["system.open", "file.open"], (params) => ({ success: true, result: { path: params.path || params.url || "simulation://open", opened: true } }));
    register("system_shutdown", ["system.shutdown"], () => ({ success: true, result: { dryRun: true, submitted: true } }), "high");
    register("skill_install", ["skill.learn"], () => ({ success: false, error: "missing external skill capability" }), "medium");
    return registry;
  }

  writeFile(file, content) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content, "utf8");
  }

  calculatorHtml() {
    return `<!doctype html><html><head><meta charset="utf-8"><title>Calculator</title></head><body>
<main><input id="display"><button>+</button><button>-</button><button>*</button><button>/</button><button>%</button></main>
<script>
const state = { value: "0" };
function press(key) { if (["+", "-", "*", "/", "%"].includes(key)) state.operator = key; }
function keydown(event) { press(event.key); }
window.addEventListener("keydown", keydown);
window.__baiqiuCalculatorTest = function(a, op, b) {
  if (op === "+") return a + b;
  if (op === "-") return a - b;
  if (op === "*") return a * b;
  if (op === "/") return a / b;
  if (op === "%") return a / 100;
  return 0;
};
${"/* simulation calculator content */\n".repeat(40)}
</script></body></html>`;
  }

  htmlApp() {
    return `<!doctype html><html><head><meta charset="utf-8"><title>Simulation App</title></head><body>
<section><h1>Simulation HTML App</h1><p>Generated for Agent simulation.</p></section>
<script>
window.simulationApp = true;
function render(){ document.body.dataset.ready = "true"; }
render();
${"console.log('simulation');\n".repeat(60)}
</script></body></html>`;
  }
}

module.exports = { ScenarioRunner, SIMULATION_ROOT, defaultScenarios };
