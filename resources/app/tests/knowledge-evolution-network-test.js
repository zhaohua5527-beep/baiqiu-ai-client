const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const { EvolutionGraph } = require("../services/evolution-network/evolution-graph");
const { KnowledgeFlowManager } = require("../services/evolution-network/knowledge-flow-manager");
const { KnowledgeImpactAnalyzer } = require("../services/evolution-network/knowledge-impact-analyzer");
const { KnowledgeEvolutionNetwork } = require("../services/evolution-network/knowledge-evolution-network");
const { PlannerAgent } = require("../services/planner-agent");

function root(name) {
  const dir = path.join("D:\\BaiQiuAI", "data", "evolution-network-tests", `run-${process.pid}`, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function sourceText() {
  const dirs = [
    path.join(__dirname, "..", "services", "evolution-network"),
    path.join(__dirname, "..", "services")
  ];
  return [
    ...fs.readdirSync(dirs[0]).filter((file) => file.endsWith(".js")).map((file) => fs.readFileSync(path.join(dirs[0], file), "utf8")),
    fs.readFileSync(path.join(dirs[1], "planner-agent.js"), "utf8")
  ].join("\n");
}

function fixtures() {
  return {
    knowledge: [
      { id: "k1", taskType: "dev.code.calculator", toolId: "calculator_creator", capability: "calculator_app", successRate: 0.99 },
      { id: "k2", taskType: "dev.code.calculator", toolId: "browser_open", skill: "open_html", successRate: 0.9 }
    ],
    experience: [
      { experienceId: "e1", taskType: "dev.code.calculator", toolId: "browser_open", errorType: "browser_missing", solution: "open_path", success: true }
    ],
    reflection: [
      { taskType: "dev.code.calculator", mistake: "missing_dependency", improvement: "add dependsOn", status: "failed", timestamp: "t1" }
    ],
    learning: {
      hints: [{ type: "failure_learning", suggestion: "review repeated browser failures" }]
    },
    evolution: {
      recommendations: [{ type: "capability", target: "calculator_app", suggestion: "grow calculator capability" }]
    }
  };
}

function run() {
  const rootDir = root("network");
  const data = fixtures();
  const graphBuilder = new EvolutionGraph({ rootDir });
  const graph = graphBuilder.build({ ...data, taskType: "dev.code.calculator" });
  assert(graph.nodes.some((node) => node.type === "task"), "graph should include task node");
  assert(graph.nodes.some((node) => node.type === "experience"), "graph should include experience node");
  assert(graph.nodes.some((node) => node.type === "strategy"), "graph should include strategy node");
  assert(graph.nodes.some((node) => node.type === "skill"), "graph should include skill node");
  assert(graph.nodes.some((node) => node.type === "capability"), "graph should include capability node");
  assert(graph.edges.some((edge) => edge.type === "experience_strategy"), "graph should connect experience to strategy");

  const flowManager = new KnowledgeFlowManager({ rootDir });
  const flow = flowManager.mapFlows({ ...data, taskType: "dev.code.calculator" });
  assert(flow.flows.some((item) => item.flow === "Experience -> Knowledge"), "flow should map Experience -> Knowledge");
  assert(flow.flows.some((item) => item.flow === "Reflection -> Improvement"), "flow should map Reflection -> Improvement");
  assert(flow.flows.some((item) => item.flow === "Learning -> Strategy"), "flow should map Learning -> Strategy");
  assert(flow.flows.some((item) => item.flow === "Evolution -> Capability"), "flow should map Evolution -> Capability");

  const impactAnalyzer = new KnowledgeImpactAnalyzer({ rootDir });
  const impact = impactAnalyzer.analyze({
    taskType: "dev.code.calculator",
    before: { successRate: 0.7, avgDuration: 9000, errorCount: 5, recoveryCount: 1 },
    after: { successRate: 0.9, avgDuration: 5000, errorCount: 2, recoveryCount: 3 },
    graph,
    flows: flow
  });
  assert(impact.successRateChange > 0, "impact should measure success rate change");
  assert(impact.avgDurationChange < 0, "impact should measure duration change");
  assert(impact.errorReduction > 0, "impact should measure error reduction");
  assert(impact.recoveryChange > 0, "impact should measure recovery change");
  assert.strictEqual(impact.status, "positive", "positive metrics should produce positive impact");

  const network = new KnowledgeEvolutionNetwork({
    rootDir,
    knowledgeCenter: { queryKnowledge: () => data.knowledge },
    experienceCenter: { list: () => data.experience },
    reflectionMemory: { loadReflections: () => ({ reflections: data.reflection }) },
    learningOrchestrator: { getHints: () => data.learning },
    selfImprovementEngine: { getHints: () => ({ hints: [{ type: "tool_selection", suggestion: "prefer calculator_creator" }] }) },
    evolutionEngine: { generateEvolutionAdvice: () => data.evolution }
  });
  const evolved = network.evolve({
    taskType: "dev.code.calculator",
    before: { successRate: 0.7, avgDuration: 9000, failCount: 5, recoveryCount: 1 },
    after: { successRate: 0.9, avgDuration: 5000, failCount: 2, recoveryCount: 3 }
  });
  assert(evolved.knowledgeEvolutionGraph.nodes.length >= graph.nodes.length, "network should generate knowledgeEvolutionGraph");
  assert(evolved.knowledgeUpdates.experienceCount === 1, "network should summarize knowledgeUpdates");
  assert.strictEqual(evolved.knowledgeImpact.status, "positive", "network should generate knowledgeImpact");
  assert.strictEqual(evolved.safety.executesTool, false, "network must not execute tools");
  assert.strictEqual(evolved.safety.modifiesPermission, false, "network must not modify permission");

  const hints = network.getHints({ taskType: "dev.code.calculator" });
  assert(hints.available, "network should expose evolution hints");
  assert(hints.graphSummary.nodes > 0, "hints should include graph summary");

  const plannerAgent = new PlannerAgent({
    knowledgeEvolutionNetwork: {
      getHints: () => ({ available: true, hints: [{ type: "knowledge_graph", suggestion: "test evolution hint" }] })
    },
    learningOrchestrator: { getHints: () => ({ available: false, hints: [] }) },
    selfImprovementEngine: { getHints: () => ({ available: false, hints: [] }) },
    knowledgeRetriever: { retrieve: () => ({ similarTasks: 0, recommendedTools: [], recommendedSkills: [], experience: [], successRate: 0, matches: [] }) },
    reasoningEngine: { reason: () => ({ taskType: "dev.code.calculator", selectedPlan: null, decision: { score: 0 }, confidence: 0, reason: "stub" }) },
    metaLearningCenter: { getHints: () => ({ available: false }) },
    reflectionMemory: { getHints: () => ({ available: false }) },
    autonomousPlanner: { plan: () => ({ steps: [] }) }
  });
  const plan = plannerAgent.createPlan({
    text: "create calculator",
    primaryIntent: "dev.code.calculator",
    intents: [{ intent: "dev.code.calculator", clause: "create calculator" }]
  }, { sessionId: "knowledge-evolution-network-test" });
  assert(plan.evolutionHints.available, "PlannerAgent should expose evolutionHints");

  for (const file of ["knowledge-graph.json", "knowledge-flow.json", "impact-report.json"]) {
    assert(fs.existsSync(path.join(rootDir, file)), `${file} should exist`);
  }

  const src = sourceText();
  assert(!src.includes("ToolExecutionService.execute"), "evolution network must not call ToolExecutionService");
  assert(!src.includes("ToolSelector.execute"), "evolution network must not bypass ToolSelector");
  assert(!src.includes("VerifierCenter.verify"), "evolution network must not bypass VerifierCenter");
  assert(!src.includes("allowAll"), "evolution network must not loosen permissions");

  return {
    ok: true,
    cases: [
      "knowledge_evolution_graph_created",
      "experience_to_knowledge_flow",
      "reflection_to_improvement_flow",
      "learning_to_strategy_flow",
      "evolution_to_capability_flow",
      "impact_success_duration_error_recovery",
      "planner_evolution_hints",
      "no_permission_change",
      "no_toolselector_or_verifier_bypass"
    ]
  };
}

if (require.main === module) console.log(JSON.stringify(run(), null, 2));

module.exports = { run };
