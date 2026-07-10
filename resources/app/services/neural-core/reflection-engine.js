const { AGENT_EVENTS } = require("./agent-events");
const { ExperienceStore } = require("./experience-store");

function metric(name, data) {
  try { require("./agent-event-bus").recordRuntimeMetric?.(name, data); } catch {}
}

class ReflectionEngine {
  constructor({ eventBus = null, experienceStore = null } = {}) {
    this.eventBus = eventBus;
    this.experienceStore = experienceStore || new ExperienceStore();
    this.reflected = new Set();
    if (eventBus) this.attach(eventBus);
  }

  attach(eventBus) {
    this.eventBus = eventBus;
    eventBus.subscribe(AGENT_EVENTS.VERIFICATION_DONE, (event) => this.onVerification(event));
    eventBus.subscribe(AGENT_EVENTS.TASK_COMPLETED, (event) => this.reflect(event));
    eventBus.subscribe(AGENT_EVENTS.TASK_FAILED, (event) => this.reflect(event));
  }

  onVerification(event = {}) {
    const data = event.payload || {};
    if (String(data.status || data.verification?.status || "").toLowerCase() === "failed") this.reflect(event);
  }

  reflect(event = {}) {
    const startedAt = Date.now();
    try {
      const traceId = event.traceId || event.sessionId || "global";
      const key = `${traceId}:${event.type}`;
      if (this.reflected.has(key)) {
        metric("ReflectionEngine.idempotency", { duration: Date.now() - startedAt, success: true, hit: true });
        return null;
      }
      this.reflected.add(key);
      const trace = this.eventBus?.getTrace?.(traceId) || null;
      const experience = this.createExperience({ event, trace });
      const saved = this.experienceStore.saveExperience(experience);
      metric("ReflectionEngine", { duration: Date.now() - startedAt, success: true });
      return saved;
    } catch (error) {
      metric("ReflectionEngine", { duration: Date.now() - startedAt, success: false });
      try {
        require("./agent-event-bus").writeDiagnostics?.({
          error: require("./agent-event-bus").normalizeError?.(error, "NC5001", "reflection")
        });
      } catch {}
      return {
        success: false,
        errorCode: "NC5001",
        error: error?.message || String(error)
      };
    }
  }

  createExperience({ event = {}, trace = null } = {}) {
    const data = event.payload || {};
    const toolsUsed = this.toolsUsed(trace, data);
    const plan = data.plan || trace?.plan || {};
    const taskType = data.intent || data.taskType || plan.primaryIntent || trace?.userIntent || this.inferTaskType({ toolsUsed, plan });
    const strategy = plan.strategyResult || data.strategyResult || null;
    const decision = plan.strategyDecision || data.strategyDecision || null;
    const failed = event.type === AGENT_EVENTS.TASK_FAILED || String(data.status || data.verification?.status || "").toLowerCase() === "failed";
    const problem = failed
      ? (data.error || data.lastError || data.reason || trace?.errors?.[trace.errors.length - 1] || "task failed")
      : "task completed";
    const cause = failed ? this.failureCause(problem, trace) : "verified execution path succeeded";
    const solution = failed ? this.solutionFor(problem, trace) : "reuse verified plan and tool sequence";
    return {
      taskType,
      intent: taskType,
      problem,
      cause,
      solution,
      toolsUsed,
      toolSequence: toolsUsed,
      strategy,
      decision,
      keywords: this.keywordsFor({ taskType, plan, toolsUsed, problem, solution }),
      successRate: failed ? 0 : 1,
      confidence: this.confidence({ failed, trace, toolsUsed }),
      createdAt: new Date().toISOString()
    };
  }

  inferTaskType({ toolsUsed = [], plan = {} } = {}) {
    const tools = toolsUsed.join(" ");
    if (/calculator_creator/.test(tools)) return "dev.code.calculator";
    if (/html_app_creator/.test(tools)) return "dev.code";
    if (/file_creator|create_folder/.test(tools)) return "file.create";
    return plan.primaryIntent || "";
  }

  keywordsFor({ taskType = "", plan = {}, toolsUsed = [], problem = "", solution = "" } = {}) {
    const raw = [
      taskType,
      plan.goal,
      plan.sourceText,
      problem,
      solution,
      ...(toolsUsed || [])
    ].filter(Boolean).join(" ");
    const words = raw
      .split(/[^A-Za-z0-9_\-\u4e00-\u9fa5]+/)
      .map((item) => item.trim())
      .filter((item) => item.length >= 2);
    if (/calculator|计算器|計算器/i.test(raw)) words.push("calculator", "计算器", "dev.code.calculator");
    if (/桌面|desktop/i.test(raw)) words.push("desktop", "桌面");
    return [...new Set(words)].slice(0, 30);
  }

  toolsUsed(trace = null, data = {}) {
    const selected = (trace?.toolSelections || []).map((item) => item.toolId || item.logicalTool);
    const executed = (trace?.executions || []).map((item) => item.toolId);
    return [...new Set([...selected, ...executed, data.toolId].filter(Boolean))];
  }

  failureCause(problem = "", trace = null) {
    const value = String(problem || "").toLowerCase();
    if (/permission|confirm|权限|授权/.test(value)) return "permission or confirmation blocked execution";
    if (/not found|enoent|不存在|路径/.test(value)) return "path or target resource was unavailable";
    if (/verify|验证|failed/.test(value)) return "verification rejected execution result";
    if (trace?.errors?.length) return "execution emitted errors before completion";
    return "unknown execution failure";
  }

  solutionFor(problem = "", trace = null) {
    const value = String(problem || "").toLowerCase();
    if (/permission|confirm|权限|授权/.test(value)) return "request explicit user confirmation before high risk action";
    if (/not found|enoent|不存在|路径/.test(value)) return "use verified workspace path or create missing dependency first";
    if (/verify|验证|failed/.test(value)) return "keep verifier result authoritative and replan before replying success";
    if (trace?.repairs?.length) return String(trace.repairs[trace.repairs.length - 1]);
    return "review trace and prefer previously verified tool sequence";
  }

  confidence({ failed = false, trace = null, toolsUsed = [] } = {}) {
    let score = failed ? 0.65 : 0.85;
    if (trace?.verifications?.length) score += 0.08;
    if (toolsUsed.length) score += 0.04;
    if (trace?.errors?.length) score -= 0.05;
    return Math.max(0.1, Math.min(1, Number(score.toFixed(2))));
  }
}

module.exports = { ReflectionEngine };
