const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const { ContextManager } = require("../services/context-management/context-manager");
const { ContextBuilder } = require("../services/context-management/context-builder");
const { ContextPriorityEngine } = require("../services/context-management/context-priority-engine");
const { ContextWindowManager } = require("../services/context-management/context-window-manager");
const { ContextCompressor } = require("../services/context-management/context-compressor");

function root(name) {
  const dir = path.join("D:\\BaiQiuAI", "data", "context-management-tests", `run-${process.pid}`, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function sourceText() {
  const dir = path.join(__dirname, "..", "services", "context-management");
  return fs.readdirSync(dir)
    .filter((file) => file.endsWith(".js"))
    .map((file) => fs.readFileSync(path.join(dir, file), "utf8"))
    .join("\n");
}

function run() {
  const rootDir = root("context");
  const builder = new ContextBuilder({
    rootDir,
    memoryCore: {
      retrieve: () => ({
        memories: [
          { scope: "short_term", content: "active calculator memory", taskType: "dev.code.calculator", confidence: 0.9 },
          { scope: "semantic", concept: "calculator_creator", content: "best calculator tool", taskType: "dev.code.calculator", confidence: 0.88 }
        ]
      })
    },
    knowledgeRetriever: {
      retrieve: () => ({ recommendedTools: ["calculator_creator", "browser_open"], successRate: 0.99 })
    },
    goalManager: {
      listGoals: () => [
        { taskType: "dev.code.calculator", goal: "create calculator app", status: "active", confidence: 0.9 }
      ]
    },
    skillRegistry: {
      query: () => [
        { skillId: "calculator", name: "Calculator Skill", status: "registered", taskTypes: ["dev.code.calculator"], capabilities: ["calculator"] }
      ]
    },
    workflowEngine: {
      load: () => ({
        workflows: {
          wf1: { workflowId: "wf1", taskType: "dev.code.calculator", status: "running" }
        }
      })
    },
    reflectionMemory: {
      getHints: () => ({ available: true, suggestion: "avoid redundant open step", confidence: 0.8 })
    }
  });

  const built = builder.build({
    input: "create calculator",
    taskType: "dev.code.calculator",
    activeContext: [{ scope: "active", content: "current user request", critical: true }]
  });
  assert(built.items.length >= 8, "ContextBuilder should collect Memory/Knowledge/Goal/Skill/Workflow/Reflection");
  assert.strictEqual(built.safety.executesTool, false, "ContextBuilder must not execute tools");
  assert(built.counts.active >= 1, "active context should be included");
  assert(built.counts.goal >= 1, "goal context should be included");
  assert(built.counts.workflow >= 1, "workflow context should be included");

  const priorityEngine = new ContextPriorityEngine({ rootDir });
  const ranked = priorityEngine.rank(built.items, { input: "create calculator", taskType: "dev.code.calculator" });
  assert(ranked[0].priorityScore >= ranked[ranked.length - 1].priorityScore, "priority engine should rank context");
  assert(ranked.some((item) => item.scope === "goal" && item.critical), "critical goal should stay visible");

  const compressor = new ContextCompressor({ rootDir });
  const windowManager = new ContextWindowManager({ rootDir, maxContextSize: 900, compressor });
  const window = windowManager.fit(ranked, { query: { input: "create calculator", taskType: "dev.code.calculator" } });
  assert(window.selected.length > 0, "window manager should select context");
  assert(window.truncated, "small window should trigger compression");
  assert(window.compression.compressionId, "compressor should create compression record");

  const manager = new ContextManager({
    rootDir,
    builder,
    priorityEngine,
    windowManager,
    compressor
  });
  const context = manager.buildContext({
    input: "create calculator",
    taskType: "dev.code.calculator",
    activeContext: [{ scope: "active", content: "current user request", critical: true }]
  });
  assert(context.contextId, "ContextManager should create context package");
  assert.strictEqual(context.safety.bypassesToolSelector, false, "ContextManager must not bypass ToolSelector");
  assert.strictEqual(context.safety.bypassesVerifierCenter, false, "ContextManager must not bypass VerifierCenter");
  assert(manager.getLatestContext().contextId === context.contextId, "latest context should be persisted");

  const src = sourceText();
  assert(!src.includes("ToolExecutionService.execute"), "context management must not call ToolExecutionService");
  assert(!src.includes("ToolSelector.execute"), "context management must not bypass ToolSelector");
  assert(!src.includes("VerifierCenter.verify"), "context management must not bypass VerifierCenter");

  for (const file of [
    "context-manager.json",
    "context-builder.json",
    "context-priority.json",
    "context-window.json",
    "context-compressed.json"
  ]) {
    assert(fs.existsSync(path.join(rootDir, file)), `${file} should exist`);
  }

  return {
    ok: true,
    cases: [
      "context_builder_connections",
      "context_priority_ranking",
      "context_window_management",
      "context_compression",
      "context_manager_package",
      "no_tool_or_verifier_bypass"
    ]
  };
}

if (require.main === module) console.log(JSON.stringify(run(), null, 2));

module.exports = { run };
