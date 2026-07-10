const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const { SelfAwarenessManager } = require("../services/self-awareness/self-awareness-manager");
const { AgentStateMonitor } = require("../services/self-awareness/agent-state-monitor");
const { CapabilityAwareness } = require("../services/self-awareness/capability-awareness");
const { LimitationDetector } = require("../services/self-awareness/limitation-detector");
const { SelfAwarenessMemory } = require("../services/self-awareness/self-awareness-memory");

function root(name) {
  const dir = path.join("D:\\BaiQiuAI", "data", "self-awareness-tests", `run-${process.pid}`, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function sourceText() {
  const dir = path.join(__dirname, "..", "services", "self-awareness");
  return fs.readdirSync(dir)
    .filter((file) => file.endsWith(".js"))
    .map((file) => fs.readFileSync(path.join(dir, file), "utf8"))
    .join("\n");
}

function run() {
  const rootDir = root("self");
  const stateMonitor = new AgentStateMonitor({ rootDir });
  const capabilityAwareness = new CapabilityAwareness({
    rootDir,
    capabilityCenter: {
      listCapabilities: () => [
        { id: "tool.calculator_creator", status: "available" },
        { id: "weather.query", status: "missing" }
      ],
      checkRequirement: (requirement) => requirement === "weather.query"
        ? { available: false, status: "missing", missing: ["weather.query"] }
        : { available: true, status: "available", missing: [] }
    }
  });
  const limitationDetector = new LimitationDetector({ rootDir });
  const selfAwarenessMemory = new SelfAwarenessMemory({ rootDir });
  const manager = new SelfAwarenessManager({
    rootDir,
    stateMonitor,
    capabilityAwareness,
    limitationDetector,
    selfAwarenessMemory,
    goalIntelligenceManager: {
      analyzeGoal: () => ({
        score: 0.9,
        pursuit: { selectedGoal: { goal: "create calculator", confidence: 0.9 }, pursuitScore: 0.95 },
        conflicts: { hasConflict: false, conflicts: [] }
      })
    },
    strategyManager: {
      analyzeStrategy: () => ({ analysis: { score: 0.88, selectedStrategy: { strategy: "use_reasoned_plan" } } })
    },
    decisionManager: {
      analyzeDecision: () => ({ decision: { score: 0.86, selectedOption: { action: "select_strategy" } } })
    },
    memoryCore: {
      retrieve: () => ({ memories: [{ content: "calculator memory" }] })
    },
    reflectionMemory: {
      getHints: () => ({ available: true, suggestion: "avoid redundant open", confidence: 0.8 })
    },
    evolutionEngine: {
      generateEvolutionAdvice: () => ({ recommendations: [{ suggestion: "keep direct strategy", confidence: 0.7 }] })
    }
  });

  const result = manager.assessSelf({
    input: "create calculator",
    taskType: "dev.code.calculator",
    requirements: ["calculator_creator"]
  });

  assert.strictEqual(result.safety.executesTool, false, "SelfAwarenessManager must not execute tools");
  for (const name of ["Goal", "Strategy", "Decision", "Memory", "Reflection", "Evolution"]) {
    assert(result.connectedSystems.includes(name), `${name} should be connected`);
  }
  assert.strictEqual(result.state.status, "goal_focused", "state monitor should detect goal focused state");
  assert.strictEqual(result.capability.ready, true, "calculator capability should be ready");
  assert.strictEqual(result.limitations.hasLimitation, false, "no limitation expected for available capability");
  assert(result.memory.awarenessId === result.awarenessId, "self awareness memory should persist result");

  const missing = manager.assessSelf({
    input: "query weather",
    taskType: "weather.query",
    requirements: ["weather.query"]
  });
  assert.strictEqual(missing.capability.ready, false, "missing capability should be detected");
  assert(missing.limitations.limitations.some((item) => item.type === "missing_capability"), "limitation detector should report missing capability");

  const history = selfAwarenessMemory.query({ taskType: "dev.code.calculator" });
  assert(history.length >= 1, "self awareness memory should be queryable");

  const src = sourceText();
  assert(!src.includes("ToolExecutionService.execute"), "self awareness must not call ToolExecutionService");
  assert(!src.includes("ToolSelector.execute"), "self awareness must not bypass ToolSelector");
  assert(!src.includes("VerifierCenter.verify"), "self awareness must not bypass VerifierCenter");

  for (const file of [
    "self-awareness-manager.json",
    "agent-state.json",
    "capability-awareness.json",
    "limitations.json",
    "self-awareness-memory.json"
  ]) {
    assert(fs.existsSync(path.join(rootDir, file)), `${file} should exist`);
  }

  return {
    ok: true,
    cases: [
      "self_awareness_manager",
      "agent_state_monitor",
      "capability_awareness",
      "limitation_detector",
      "self_awareness_memory",
      "external_connections",
      "no_tool_or_verifier_bypass"
    ]
  };
}

if (require.main === module) console.log(JSON.stringify(run(), null, 2));

module.exports = { run };
