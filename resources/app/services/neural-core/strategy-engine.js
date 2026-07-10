function normalize(value = "") {
  return String(value || "").trim().toLowerCase();
}

function metric(name, data) {
  try { require("./agent-event-bus").recordRuntimeMetric?.(name, data); } catch {}
}

function errorCode() {
  try { return require("./agent-event-bus").ERROR_CODES.STRATEGY_FAILURE; } catch { return "NC1001"; }
}

function avg(values = []) {
  const list = values.map(Number).filter(Number.isFinite);
  return list.length ? list.reduce((sum, value) => sum + value, 0) / list.length : 0;
}

class StrategyEngine {
  chooseStrategy({ taskType = "", experiences = [], riskLevel = "low", goal = "" } = {}) {
    const startedAt = Date.now();
    try {
      const related = this.rankExperiences({ taskType, experiences, goal });
      const tools = [...new Set(related.flatMap((item) => Array.isArray(item.toolsUsed) ? item.toolsUsed : []).filter(Boolean))];
      const successRate = avg(related.map((item) => item.successRate));
      const confidence = this.confidence({ related, successRate, riskLevel });
      const strategy = {
        strategyId: this.strategyId({ taskType, tools, riskLevel }),
        taskType,
        mode: this.modeFor({ successRate, riskLevel, related }),
        recommendedTools: tools,
        riskLevel,
        experienceCount: related.length,
        successRate,
        confidence,
        reason: this.reasonFor({ related, successRate, riskLevel, tools }),
        experiencesUsed: related.slice(0, 5),
        teamNeeds: this.teamNeedsFor({ taskType, goal, riskLevel })
      };
      metric("StrategyEngine", { duration: Date.now() - startedAt, success: true, hit: related.length > 0 });
      return strategy;
    } catch (error) {
      metric("StrategyEngine", { duration: Date.now() - startedAt, success: false });
      return {
        strategyId: this.strategyId({ taskType, tools: [], riskLevel }),
        taskType,
        mode: "default_verified",
        recommendedTools: [],
        riskLevel,
        experienceCount: 0,
        successRate: 0,
        confidence: 0.3,
        reason: `${errorCode()} Strategy Failure: ${error?.message || error}`,
        experiencesUsed: [],
        teamNeeds: this.teamNeedsFor({ taskType, goal, riskLevel }),
        errorCode: errorCode(),
        recovered: true
      };
    }
  }

  rankExperiences({ taskType = "", experiences = [], goal = "" } = {}) {
    const task = normalize(taskType);
    const text = normalize(goal);
    return experiences
      .map((item) => ({
        ...item,
        relevance: Number.isFinite(Number(item.relevance)) ? Number(item.relevance) : this.relevance(item, task, text)
      }))
      .sort((a, b) => {
        const aScore = Number(a.relevance || 0) + Number(a.confidence || 0) + Number(a.successRate || 0);
        const bScore = Number(b.relevance || 0) + Number(b.confidence || 0) + Number(b.successRate || 0);
        return bScore - aScore;
      });
  }

  relevance(item = {}, taskType = "", goal = "") {
    let score = 0;
    const itemTask = normalize(item.taskType);
    const haystack = normalize(`${item.problem} ${item.cause} ${item.solution} ${(item.toolsUsed || []).join(" ")}`);
    if (taskType && (itemTask.includes(taskType) || taskType.includes(itemTask))) score += 0.55;
    if (goal && haystack && haystack.split(/\s+/).some((part) => part && goal.includes(part))) score += 0.2;
    if (Number(item.successRate || 0) >= 0.8) score += 0.15;
    if (Number(item.confidence || 0) >= 0.8) score += 0.1;
    return Math.max(0, Math.min(1, Number(score.toFixed(2))));
  }

  confidence({ related = [], successRate = 0, riskLevel = "low" } = {}) {
    let score = 0.45 + Math.min(0.25, related.length * 0.05) + (Number(successRate || 0) * 0.25);
    if (riskLevel === "high") score -= 0.15;
    if (riskLevel === "medium") score -= 0.05;
    return Math.max(0.1, Math.min(1, Number(score.toFixed(2))));
  }

  modeFor({ successRate = 0, riskLevel = "low", related = [] } = {}) {
    if (riskLevel === "high") return "permission_aware";
    if (!related.length) return "default_verified";
    if (successRate >= 0.85) return "experience_preferred";
    if (successRate > 0 && successRate < 0.5) return "cautious_replan";
    return "balanced";
  }

  reasonFor({ related = [], successRate = 0, riskLevel = "low", tools = [] } = {}) {
    if (riskLevel === "high") return "high risk task requires permission-aware strategy";
    if (!related.length) return "no related experience, use default verified planning path";
    if (successRate >= 0.85) return `related experience has high success rate; prefer ${tools.join(", ") || "verified tools"}`;
    if (successRate > 0 && successRate < 0.5) return "related experience shows low success, use cautious strategy";
    return "related experience found, use balanced strategy";
  }

  strategyId({ taskType = "", tools = [], riskLevel = "low" } = {}) {
    const base = normalize(taskType).replace(/[^a-z0-9_.-]+/g, "_") || "general";
    const toolPart = tools.length ? tools.join("+") : "default";
    return `${base}:${riskLevel}:${toolPart}`;
  }

  teamNeedsFor({ taskType = "", goal = "", riskLevel = "low" } = {}) {
    const text = normalize(`${taskType} ${goal}`);
    const needs = [
      { role: "supervisor", responsibility: "understand goal and task boundary", capabilities: ["understand_goal"] },
      { role: "planner", responsibility: "create plan and dependencies", capabilities: ["create_plan", "build_task_graph"] }
    ];
    if (/dev\.code|file\.create|system|skill|calculator|html|folder|create|open|shutdown/.test(text)) {
      needs.push({ role: "executor", responsibility: "execute tool tasks through the normal execution chain", capabilities: ["execute_tool_task"] });
      needs.push({ role: "verifier", responsibility: "verify task result", capabilities: ["verify_result"] });
    }
    if (riskLevel === "high") {
      needs[0] = { ...needs[0], responsibility: "understand goal, task boundary, and permission risk" };
    }
    return needs;
  }
}

module.exports = { StrategyEngine };
