const fs = require("node:fs");
const path = require("node:path");
const { ReflectionMemory } = require("../reflection/reflection-memory");
const { ExperienceCenter } = require("../experience/experience-center");
const { PerformanceTracker } = require("../optimization/performance-tracker");
const { KnowledgeCenter } = require("../knowledge/knowledge-center");
const { SelfAwarenessMemory } = require("../self-awareness/self-awareness-memory");
const { DEFAULT_SELF_IMPROVEMENT_ROOT } = require("./improvement-memory");

function nowIso() {
  return new Date().toISOString();
}

function groupCount(items = [], keyFn = () => "") {
  const counts = {};
  for (const item of items) {
    const key = keyFn(item) || "unknown";
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

class ImprovementAnalyzer {
  constructor({
    rootDir = DEFAULT_SELF_IMPROVEMENT_ROOT,
    reflectionMemory = null,
    experienceCenter = null,
    performanceTracker = null,
    knowledgeCenter = null,
    selfAwarenessMemory = null
  } = {}) {
    this.rootDir = rootDir;
    this.filePath = path.join(rootDir, "improvement-analysis.json");
    this.reflectionMemory = reflectionMemory || new ReflectionMemory();
    this.experienceCenter = experienceCenter || new ExperienceCenter();
    this.performanceTracker = performanceTracker || new PerformanceTracker();
    this.knowledgeCenter = knowledgeCenter || new KnowledgeCenter();
    this.selfAwarenessMemory = selfAwarenessMemory || new SelfAwarenessMemory();
    this.ensureStore();
  }

  analyze({ taskType = "", executionResult = null } = {}) {
    const reflections = (this.reflectionMemory.loadReflections?.().reflections || []).filter((item) => !taskType || item.taskType === taskType);
    const experiences = (this.experienceCenter.list?.() || []).filter((item) => !taskType || item.taskType === taskType);
    const performance = (this.performanceTracker.list?.() || []).filter((item) => !taskType || item.taskType === taskType);
    const knowledge = this.knowledgeCenter.queryKnowledge?.({ taskType }) || [];
    const awareness = this.selfAwarenessMemory.query?.({ taskType, limit: 50 }) || [];
    const failures = experiences.filter((item) => item.success === false || item.errorType);
    const failurePatterns = groupCount(failures, (item) => item.errorType || item.failedReason || "failed");
    const lowPerformance = performance.filter((item) => Number(item.sampleCount || 0) >= 1 && Number(item.successRate || 0) < 0.8);
    const slowSteps = performance.filter((item) => Number(item.avgDuration || 0) > 5000);
    const limitations = awareness.flatMap((item) => item.limitations || []);
    const planningIssues = reflections.filter((item) => /plan|planning|depends|step|规划|步骤/i.test(`${item.mistake || ""} ${item.reason || ""} ${item.improvement || ""}`));
    const contextIssues = reflections.filter((item) => /context|memory|上下文|记忆/i.test(`${item.mistake || ""} ${item.reason || ""} ${item.improvement || ""}`));
    const toolIssues = failures.filter((item) => item.toolId);
    const result = {
      analysisId: `improve-analysis-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      taskType,
      executionStatus: executionResult?.success === false ? "failed" : executionResult?.success === true ? "success" : "unknown",
      reflectionCount: reflections.length,
      experienceCount: experiences.length,
      performanceCount: performance.length,
      knowledgeCount: knowledge.length,
      awarenessCount: awareness.length,
      failurePatterns,
      highFrequencyFailures: Object.entries(failurePatterns).filter(([, count]) => count >= 2).map(([type, count]) => ({ type, count })),
      lowEfficiencySteps: slowSteps,
      toolSelectionIssues: groupCount(toolIssues, (item) => item.toolId),
      planningIssues,
      contextIssues,
      limitations,
      lowPerformance,
      timestamp: nowIso(),
      safety: this.safety()
    };
    this.writeJson(this.filePath, result);
    return result;
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
    if (!fs.existsSync(this.filePath)) this.writeJson(this.filePath, { safety: this.safety() });
  }

  writeJson(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  }
}

module.exports = { ImprovementAnalyzer };
