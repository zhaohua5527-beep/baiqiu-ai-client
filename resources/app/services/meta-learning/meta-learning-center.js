const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_META_LEARNING_ROOT = path.join("D:\\BaiQiuAI", "data", "meta-learning");

function nowIso() {
  return new Date().toISOString();
}

function strategyId(strategy = {}) {
  if (typeof strategy === "string") return strategy;
  if (strategy.id) return String(strategy.id);
  const tools = Array.isArray(strategy.tools) ? strategy.tools : [];
  return tools.length ? tools.join("+") : "unknown_strategy";
}

class MetaLearningCenter {
  constructor({ rootDir = DEFAULT_META_LEARNING_ROOT, maxHistory = 500 } = {}) {
    this.rootDir = rootDir;
    this.learningFile = path.join(rootDir, "learning.json");
    this.strategiesFile = path.join(rootDir, "strategies.json");
    this.policyHistoryFile = path.join(rootDir, "policy-history.json");
    this.maxHistory = maxHistory;
    this.ensureStore();
  }

  ensureStore() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.learningFile)) this.writeJson(this.learningFile, { records: [] });
    if (!fs.existsSync(this.strategiesFile)) this.writeJson(this.strategiesFile, { strategies: {} });
    if (!fs.existsSync(this.policyHistoryFile)) this.writeJson(this.policyHistoryFile, { history: [] });
  }

  recordLearning(input = {}) {
    if (!this.canLearn(input)) return null;
    const strategy = input.strategy || {};
    const item = {
      taskType: input.taskType || "",
      strategy,
      successRate: Number.isFinite(Number(input.successRate)) ? Number(input.successRate) : 1,
      failureRate: Number.isFinite(Number(input.failureRate)) ? Number(input.failureRate) : 0,
      avgDuration: Math.max(0, Number(input.avgDuration || input.duration || 0)),
      recoveryCount: Math.max(0, Number(input.recoveryCount || 0)),
      recommendation: input.recommendation || strategyId(strategy),
      timestamp: input.timestamp || nowIso()
    };
    const data = this.loadLearning();
    data.records.push(item);
    this.writeJson(this.learningFile, { records: data.records.slice(-this.maxHistory) });
    this.adjustStrategy({ taskType: item.taskType, strategy, delta: 1, reason: "verified_success" });
    return item;
  }

  canLearn(input = {}) {
    if (input.success !== true) return false;
    if (input.verified === false) return false;
    if (String(input.verificationStatus || "passed").toLowerCase() !== "passed") return false;
    const errorType = String(input.errorType || "").toLowerCase();
    if (errorType === "fatal" || errorType === "permission" || errorType === "permission_denied") return false;
    return true;
  }

  adjustStrategy({ taskType = "", strategy = {}, delta = 0, reason = "" } = {}) {
    const id = strategyId(strategy);
    const data = this.loadStrategies();
    const key = `${taskType || "unknown"}::${id}`;
    const previous = data.strategies[key] || {
      taskType,
      strategyId: id,
      strategy,
      weight: 0,
      successCount: 0,
      failCount: 0,
      consecutiveFailCount: 0,
      status: "active",
      updatedAt: ""
    };
    const next = {
      ...previous,
      taskType: taskType || previous.taskType,
      strategyId: id,
      strategy: strategy && Object.keys(strategy).length ? strategy : previous.strategy,
      weight: Number(previous.weight || 0) + Number(delta || 0),
      successCount: Number(previous.successCount || 0) + (delta > 0 ? 1 : 0),
      failCount: Number(previous.failCount || 0) + (delta < 0 ? 1 : 0),
      consecutiveFailCount: delta < 0 ? Number(previous.consecutiveFailCount || 0) + 1 : 0,
      updatedAt: nowIso()
    };
    if (next.consecutiveFailCount >= 3) next.status = "deprecated";
    data.strategies[key] = next;
    this.writeJson(this.strategiesFile, data);
    this.recordPolicyHistory({ taskType, strategyId: id, delta, weight: next.weight, status: next.status, reason });
    return next;
  }

  getHints({ taskType = "" } = {}) {
    const strategies = Object.values(this.loadStrategies().strategies || {})
      .filter((item) => !taskType || item.taskType === taskType)
      .sort((a, b) => Number(b.weight || 0) - Number(a.weight || 0));
    const active = strategies.filter((item) => item.status !== "deprecated");
    const best = active[0] || null;
    return {
      available: Boolean(best),
      taskType,
      recommendation: best?.strategyId || "",
      weight: Number(best?.weight || 0),
      strategies: active
    };
  }

  recordPolicyHistory(input = {}) {
    const data = this.loadPolicyHistory();
    data.history.push({
      taskType: input.taskType || "",
      strategyId: input.strategyId || "",
      delta: Number(input.delta || 0),
      weight: Number(input.weight || 0),
      status: input.status || "active",
      reason: input.reason || "",
      timestamp: input.timestamp || nowIso()
    });
    this.writeJson(this.policyHistoryFile, { history: data.history.slice(-this.maxHistory) });
  }

  loadLearning() {
    return this.readJson(this.learningFile, { records: [] });
  }

  loadStrategies() {
    return this.readJson(this.strategiesFile, { strategies: {} });
  }

  loadPolicyHistory() {
    return this.readJson(this.policyHistoryFile, { history: [] });
  }

  readJson(file, fallback) {
    this.ensureStore();
    try {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      return fallback;
    }
  }

  writeJson(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  }
}

module.exports = { MetaLearningCenter, DEFAULT_META_LEARNING_ROOT, strategyId };
