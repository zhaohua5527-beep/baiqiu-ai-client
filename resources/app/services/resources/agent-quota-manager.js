const fs = require("node:fs");
const path = require("node:path");
const { dataRoot } = require("../data-root");

const DEFAULT_RESOURCE_ROOT = path.join(dataRoot(), "resources");

const DEFAULT_QUOTA = Object.freeze({
  maxConcurrentTasks: 3,
  maxDailyTasks: 100,
  maxToolCalls: 100,
  maxEstimatedCost: 1000
});

class AgentQuotaManager {
  constructor({ rootDir = DEFAULT_RESOURCE_ROOT, quotaFile = null } = {}) {
    this.rootDir = rootDir;
    this.quotaFile = quotaFile || path.join(rootDir, "quotas.json");
    this.ensureStore();
  }

  setQuota(agent = "", quota = {}) {
    const data = this.load();
    data.quotas[agent || "default"] = { ...DEFAULT_QUOTA, ...(data.quotas[agent] || {}), ...quota };
    this.save(data);
    return data.quotas[agent || "default"];
  }

  getQuota(agent = "") {
    const data = this.load();
    return { ...DEFAULT_QUOTA, ...(data.quotas[agent] || data.quotas.default || {}) };
  }

  check(agent = "", usage = {}) {
    const quota = this.getQuota(agent);
    const violations = [];
    if (Number(usage.concurrentTasks || 0) > Number(quota.maxConcurrentTasks)) violations.push("max_concurrent_tasks");
    if (Number(usage.dailyTasks || 0) > Number(quota.maxDailyTasks)) violations.push("max_daily_tasks");
    if (Number(usage.toolCalls || 0) > Number(quota.maxToolCalls)) violations.push("max_tool_calls");
    if (Number(usage.estimatedCost || 0) > Number(quota.maxEstimatedCost)) violations.push("max_estimated_cost");
    return {
      allowed: violations.length === 0,
      status: violations.length ? "quota_exceeded" : "allowed",
      violations,
      quota,
      usage
    };
  }

  ensureStore() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.quotaFile)) this.save({ quotas: { default: { ...DEFAULT_QUOTA } } });
  }

  load() {
    this.ensureStore();
    try {
      const parsed = JSON.parse(fs.readFileSync(this.quotaFile, "utf8"));
      return { quotas: parsed.quotas && typeof parsed.quotas === "object" ? parsed.quotas : { default: { ...DEFAULT_QUOTA } } };
    } catch {
      return { quotas: { default: { ...DEFAULT_QUOTA } } };
    }
  }

  save(data = {}) {
    fs.mkdirSync(this.rootDir, { recursive: true });
    fs.writeFileSync(this.quotaFile, JSON.stringify({ quotas: data.quotas || {} }, null, 2), "utf8");
  }
}

module.exports = { AgentQuotaManager, DEFAULT_RESOURCE_ROOT, DEFAULT_QUOTA };
