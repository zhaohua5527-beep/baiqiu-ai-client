const fs = require("node:fs");
const path = require("node:path");
const { DEFAULT_SELF_IMPROVEMENT_ROOT } = require("./improvement-memory");

function nowIso() {
  return new Date().toISOString();
}

class ImprovementPlanner {
  constructor({ rootDir = DEFAULT_SELF_IMPROVEMENT_ROOT } = {}) {
    this.rootDir = rootDir;
    this.filePath = path.join(rootDir, "improvement-plan.json");
    this.ensureStore();
  }

  plan(analysis = {}) {
    const strategyImprove = [];
    const planningImprove = [];
    const toolSelectionImprove = [];
    const memoryImprove = [];

    for (const item of analysis.highFrequencyFailures || []) {
      strategyImprove.push({
        type: "failure_pattern",
        target: item.type,
        suggestion: `reduce repeated failure pattern: ${item.type}`,
        confidence: Math.min(0.95, 0.55 + item.count * 0.1)
      });
    }
    if ((analysis.planningIssues || []).length) {
      planningImprove.push({
        type: "planning_issue",
        target: "planner",
        suggestion: "review step ordering, dependency generation, and ambiguous requirement handling",
        confidence: 0.82
      });
    }
    for (const item of analysis.lowPerformance || []) {
      toolSelectionImprove.push({
        type: "low_success_tool",
        target: item.toolId,
        suggestion: `prefer alternatives or add verification before ${item.toolId}`,
        confidence: 0.78
      });
    }
    for (const [toolId, count] of Object.entries(analysis.toolSelectionIssues || {})) {
      toolSelectionImprove.push({
        type: "tool_failure",
        target: toolId,
        suggestion: `inspect tool selection for ${toolId}`,
        confidence: Math.min(0.9, 0.55 + Number(count) * 0.08)
      });
    }
    if ((analysis.contextIssues || []).length || (analysis.limitations || []).some((item) => item.type === "missing_capability")) {
      memoryImprove.push({
        type: "context_memory_issue",
        target: "memory_context",
        suggestion: "strengthen relevant memory/context retrieval before planning",
        confidence: 0.76
      });
    }
    const plan = {
      improvementPlanId: `improve-plan-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      taskType: analysis.taskType || "",
      strategyImprove,
      planningImprove,
      toolSelectionImprove,
      memoryImprove,
      hints: [...strategyImprove, ...planningImprove, ...toolSelectionImprove, ...memoryImprove],
      timestamp: nowIso(),
      safety: this.safety()
    };
    this.writeJson(this.filePath, plan);
    return plan;
  }

  safety() {
    return {
      selfImprovementOnly: true,
      advisoryOnly: true,
      modifiesPermission: false,
      executesTool: false,
      bypassesToolSelector: false,
      bypassesVerifierCenter: false
    };
  }

  ensureStore() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.filePath)) this.writeJson(this.filePath, { hints: [], safety: this.safety() });
  }

  writeJson(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  }
}

module.exports = { ImprovementPlanner };
