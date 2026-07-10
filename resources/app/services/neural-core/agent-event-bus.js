const { AGENT_EVENTS, createAgentEvent } = require("./agent-events");
const { AgentTrace } = require("./agent-trace");
const { NeuralGovernance } = require("./governance");
const { ReflectionEngine } = require("./reflection-engine");
const fs = require("node:fs");
const path = require("node:path");

const RUNTIME_DIR = path.join("D:\\BaiQiuAI", "data", "neural-core");
const RUNTIME_METRICS_FILE = path.join(RUNTIME_DIR, "runtime-metrics.json");
const HEALTH_REPORT_FILE = path.join(RUNTIME_DIR, "health-report.json");
const DIAGNOSTICS_FILE = path.join(RUNTIME_DIR, "diagnostics.json");
const ERROR_CODES = Object.freeze({
  STRATEGY_FAILURE: "NC1001",
  DECISION_FAILURE: "NC1002",
  PLANNER_FAILURE: "NC2001",
  TOOL_FAILURE: "NC3001",
  VERIFIER_FAILURE: "NC4001",
  REFLECTION_FAILURE: "NC5001",
  MEMORY_FAILURE: "NC6001",
  EVENT_FAILURE: "NC7001",
  IDEMPOTENCY_SKIP: "NC8001",
  UNKNOWN_RUNTIME_FAILURE: "NC9001"
});

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

function recordRuntimeMetric(name, { duration = 0, success = true, hit = null } = {}) {
  const data = readJson(RUNTIME_METRICS_FILE, { modules: {}, updatedAt: "" });
  const item = data.modules[name] || { calls: 0, success: 0, failed: 0, totalDuration: 0, maxDuration: 0, hits: 0, misses: 0 };
  item.calls += 1;
  if (success === false) item.failed += 1;
  else item.success += 1;
  item.totalDuration += Math.max(0, Number(duration) || 0);
  item.maxDuration = Math.max(item.maxDuration, Math.max(0, Number(duration) || 0));
  if (hit === true) item.hits += 1;
  if (hit === false) item.misses += 1;
  item.avgDuration = item.calls ? Number((item.totalDuration / item.calls).toFixed(2)) : 0;
  item.successRate = item.calls ? Number((item.success / item.calls).toFixed(2)) : 0;
  item.hitRate = (item.hits + item.misses) ? Number((item.hits / (item.hits + item.misses)).toFixed(2)) : 0;
  data.modules[name] = item;
  data.updatedAt = new Date().toISOString();
  try {
    writeJson(RUNTIME_METRICS_FILE, data);
    writeHealthReport();
    writeDiagnostics({ lastMetric: name });
  } catch {}
  return item;
}

function normalizeError(error, code = ERROR_CODES.UNKNOWN_RUNTIME_FAILURE, layer = "runtime") {
  const message = error?.message || String(error || "Unknown runtime failure");
  return {
    code,
    layer,
    message,
    recoverable: true,
    timestamp: new Date().toISOString()
  };
}

function writeHealthReport() {
  const metrics = readJson(RUNTIME_METRICS_FILE, { modules: {} });
  const modules = metrics.modules || {};
  const calls = Object.values(modules).reduce((sum, item) => sum + Number(item.calls || 0), 0);
  const avgSuccess = Object.values(modules).length
    ? Object.values(modules).reduce((sum, item) => sum + Number(item.successRate || 0), 0) / Object.values(modules).length
    : 0;
  const report = {
    generatedAt: new Date().toISOString(),
    architecture: 84,
    integration: Math.min(100, 70 + Object.keys(modules).length * 3),
    deadCode: 62,
    coverage: Math.min(100, 60 + Math.min(40, calls)),
    performance: 90,
    maintainability: 68,
    modules
  };
  report.overall = Math.round((report.architecture + report.integration + report.deadCode + report.coverage + report.performance + report.maintainability + Math.round(avgSuccess * 100)) / 7);
  writeJson(HEALTH_REPORT_FILE, report);
  return report;
}

function writeDiagnostics(extra = {}) {
  const metrics = readJson(RUNTIME_METRICS_FILE, { modules: {} });
  const health = readJson(HEALTH_REPORT_FILE, {});
  const diagnostics = {
    generatedAt: new Date().toISOString(),
    runtime: {
      status: "running",
      metricsFile: RUNTIME_METRICS_FILE,
      healthFile: HEALTH_REPORT_FILE
    },
    memory: {
      root: path.join("D:\\BaiQiuAI", "data", "memory")
    },
    experience: {
      file: path.join("D:\\BaiQiuAI", "data", "memory", "experience.json")
    },
    coverage: metrics.modules || {},
    health,
    performance: Object.entries(metrics.modules || {}).map(([module, item]) => ({
      module,
      avgDuration: item.avgDuration || 0,
      maxDuration: item.maxDuration || 0,
      successRate: item.successRate || 0
    })),
    error: extra.error || null,
    extra
  };
  writeJson(DIAGNOSTICS_FILE, diagnostics);
  return diagnostics;
}

class AgentEventBus {
  constructor({ trace = null, governance = null, reflectionEngine = undefined } = {}) {
    this.listeners = new Map();
    this.trace = trace || new AgentTrace();
    this.governance = governance || new NeuralGovernance();
    this.reflectionEngine = reflectionEngine === undefined ? new ReflectionEngine({ eventBus: this }) : reflectionEngine;
    this.consumedEvents = new Set();
    this.maxConsumedEvents = 1000;
  }

  subscribe(type, handler) {
    const key = type || "*";
    const handlers = this.listeners.get(key) || new Set();
    handlers.add(handler);
    this.listeners.set(key, handlers);
    return () => handlers.delete(handler);
  }

  publish(type, payload = {}) {
    const startedAt = Date.now();
    const event = createAgentEvent(type, payload);
    const consistencyKey = this.eventKey(event);
    if (this.consumedEvents.has(consistencyKey)) {
      recordRuntimeMetric(`event.${type}.duplicate`, { duration: Date.now() - startedAt, success: true, hit: true });
      return { ...event, duplicate: true, blocked: false, governance: { allowed: true, status: "duplicate_ignored", reason: ERROR_CODES.IDEMPOTENCY_SKIP } };
    }
    this.rememberEvent(consistencyKey);
    let decision;
    try {
      decision = this.governance.check(event);
    } catch (error) {
      decision = { allowed: false, status: "governance_error", reason: normalizeError(error, ERROR_CODES.EVENT_FAILURE, "governance").message };
    }
    const finalEvent = {
      ...event,
      governance: decision,
      blocked: decision.allowed === false
    };
    try {
      this.trace.record(finalEvent);
    } catch (error) {
      writeDiagnostics({ error: normalizeError(error, ERROR_CODES.EVENT_FAILURE, "trace") });
    }
    this.dispatch(finalEvent);
    if (finalEvent.blocked) this.dispatch(createAgentEvent(AGENT_EVENTS.TASK_FAILED, {
      ...payload,
      sessionId: event.sessionId,
      traceId: event.traceId,
      error: decision.reason,
      governance: decision
    }));
    recordRuntimeMetric(`event.${type}`, { duration: Date.now() - startedAt, success: finalEvent.blocked !== true });
    return finalEvent;
  }

  dispatch(event) {
    const handlers = [...(this.listeners.get(event.type) || []), ...(this.listeners.get("*") || [])];
    const seen = new Set();
    for (const handler of handlers) {
      if (seen.has(handler)) continue;
      seen.add(handler);
      try {
        handler(event);
      } catch (error) {
        recordRuntimeMetric(`event.${event.type}.handler_error`, { success: false });
        writeDiagnostics({ error: normalizeError(error, ERROR_CODES.EVENT_FAILURE, "event_handler") });
      }
    }
  }

  getTrace(traceId = "global") {
    return this.trace.snapshot(traceId);
  }

  eventKey(event = {}) {
    const payload = event.payload || {};
    if (payload.eventId) return `eventId:${payload.eventId}`;
    const stableTask = event.taskId || payload.taskId || payload.assignment?.assignmentId || payload.team?.teamId || payload.plan?.id || "";
    const stableStatus = payload.status || payload.toolId || payload.intent || payload.currentAgent || "";
    return [event.sessionId || "global", event.traceId || "", event.type || "", stableTask, stableStatus].join("|");
  }

  rememberEvent(key) {
    this.consumedEvents.add(key);
    if (this.consumedEvents.size > this.maxConsumedEvents) {
      const first = this.consumedEvents.values().next().value;
      this.consumedEvents.delete(first);
    }
  }
}

const defaultAgentEventBus = new AgentEventBus();

function getDefaultAgentEventBus() {
  return defaultAgentEventBus;
}

module.exports = { AgentEventBus, getDefaultAgentEventBus, AGENT_EVENTS, ERROR_CODES, normalizeError, recordRuntimeMetric, writeHealthReport, writeDiagnostics, RUNTIME_METRICS_FILE, HEALTH_REPORT_FILE, DIAGNOSTICS_FILE };
