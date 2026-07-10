const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const { AttentionManager } = require("../services/attention/attention-manager");
const { AttentionSelector } = require("../services/attention/attention-selector");
const { AttentionPriorityEngine } = require("../services/attention/attention-priority-engine");
const { AttentionMonitor } = require("../services/attention/attention-monitor");
const { AttentionMemory } = require("../services/attention/attention-memory");

function root(name) {
  const dir = path.join("D:\\BaiQiuAI", "data", "attention-tests", `run-${process.pid}`, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function sourceText() {
  const dir = path.join(__dirname, "..", "services", "attention");
  return fs.readdirSync(dir)
    .filter((file) => file.endsWith(".js"))
    .map((file) => fs.readFileSync(path.join(dir, file), "utf8"))
    .join("\n");
}

function run() {
  const rootDir = root("attention");
  const priorityEngine = new AttentionPriorityEngine({ rootDir });
  const selector = new AttentionSelector({ rootDir, priorityEngine, maxFocusItems: 3 });
  const monitor = new AttentionMonitor({ rootDir });
  const attentionMemory = new AttentionMemory({ rootDir });

  const manager = new AttentionManager({
    rootDir,
    priorityEngine,
    selector,
    monitor,
    attentionMemory,
    contextManager: {
      buildContext: () => ({
        items: [
          { source: "ContextManager", taskType: "dev.code.calculator", content: "current calculator task", confidence: 0.88, critical: true, tags: ["context"] }
        ]
      })
    },
    memoryCore: {
      retrieve: () => ({
        memories: [
          { taskType: "dev.code.calculator", content: "calculator_creator usually succeeds", retrievalScore: 0.9, tags: ["memory"] }
        ]
      })
    },
    goalManager: {
      listGoals: () => [
        { taskType: "dev.code.calculator", goal: "finish calculator app", status: "active", confidence: 0.92, priorityScore: 0.9 }
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
      getHints: () => ({ available: true, suggestion: "avoid redundant browser_open", confidence: 0.82 })
    },
    evolutionEngine: {
      generateEvolutionAdvice: () => ({
        recommendations: [
          { type: "capability", target: "calculator", suggestion: "keep calculator direct strategy", confidence: 0.7 }
        ]
      })
    }
  });

  const result = manager.focus({
    input: "create calculator",
    taskType: "dev.code.calculator",
    activeContext: [{ content: "user asks to create calculator" }],
    limit: 3
  });

  assert.strictEqual(result.safety.executesTool, false, "AttentionManager must not execute tools");
  assert(result.signals.some((item) => item.sourceType === "context"), "context signal should be collected");
  assert(result.signals.some((item) => item.sourceType === "memory"), "memory signal should be collected");
  assert(result.signals.some((item) => item.sourceType === "goal"), "goal signal should be collected");
  assert(result.signals.some((item) => item.sourceType === "workflow"), "workflow signal should be collected");
  assert(result.signals.some((item) => item.sourceType === "reflection"), "reflection signal should be collected");
  assert(result.signals.some((item) => item.sourceType === "evolution"), "evolution signal should be collected");
  assert(result.selection.selected.length === 3, "selector should enforce focus limit");
  assert(result.selection.selected[0].attentionScore >= result.selection.selected[result.selection.selected.length - 1].attentionScore, "attention should be ranked");
  assert(result.memory.memoryId, "attention memory should store selection");
  assert.strictEqual(monitor.getStatus().status, "focused", "monitor should record focus state");

  const manualSignals = [
    { sourceType: "memory", content: "low", confidence: 0.2 },
    { sourceType: "goal", content: "urgent active goal", confidence: 0.8, urgent: true, critical: true }
  ];
  const manualSelection = selector.select(manualSignals, { input: "goal", limit: 1 });
  assert.strictEqual(manualSelection.selected[0].sourceType, "goal", "priority should prefer urgent goals");

  const src = sourceText();
  assert(!src.includes("ToolExecutionService.execute"), "attention system must not call ToolExecutionService");
  assert(!src.includes("ToolSelector.execute"), "attention system must not bypass ToolSelector");
  assert(!src.includes("VerifierCenter.verify"), "attention system must not bypass VerifierCenter");

  for (const file of [
    "attention-manager.json",
    "attention-selector.json",
    "attention-priority.json",
    "attention-monitor.json",
    "attention-memory.json"
  ]) {
    assert(fs.existsSync(path.join(rootDir, file)), `${file} should exist`);
  }

  return {
    ok: true,
    cases: [
      "attention_manager",
      "attention_selector",
      "attention_priority_engine",
      "attention_monitor",
      "attention_memory",
      "external_connections",
      "no_tool_or_verifier_bypass"
    ]
  };
}

if (require.main === module) console.log(JSON.stringify(run(), null, 2));

module.exports = { run };
