const SENSITIVE_KEY = /api[-_]?key|authorization|token|secret|password|passwd|credential|cookie/i;
const SENSITIVE_VALUE = /(sk-[a-z0-9]{12,}|bearer\s+[a-z0-9._-]+|api[-_]?key\s*[:=]\s*\S+|password\s*[:=]\s*\S+|token\s*[:=]\s*\S+)/i;

class EventRecorder {
  constructor({ exporter = null, maxEventsPerTrace = 500 } = {}) {
    this.exporter = exporter;
    this.maxEventsPerTrace = Number(maxEventsPerTrace) || 500;
    this.traces = new Map();
  }

  startTrace(trace = {}) {
    const traceId = String(trace.traceId || "").trim();
    if (!traceId) throw new Error("EventRecorder.startTrace requires traceId");
    const item = {
      traceId,
      sessionId: trace.sessionId || "",
      userMessage: this.sanitize(trace.userMessage || ""),
      status: "running",
      startedAt: trace.startedAt || new Date().toISOString(),
      finishedAt: "",
      durationMs: 0,
      events: [],
      result: {}
    };
    this.traces.set(traceId, item);
    this.record({
      traceId,
      agent: "User",
      event: "input",
      status: "received",
      data: { message: trace.userMessage || "", sessionId: trace.sessionId || "" }
    });
    return item;
  }

  record({ traceId, agent = "System", event = "event", status = "info", data = {} } = {}) {
    if (!traceId) return null;
    const trace = this.traces.get(traceId) || this.startTrace({ traceId });
    const entry = {
      traceId,
      agent: String(agent || "System"),
      event: String(event || "event"),
      status: String(status || "info"),
      time: new Date().toISOString(),
      data: this.sanitize(data)
    };
    trace.events.push(entry);
    if (trace.events.length > this.maxEventsPerTrace) trace.events.splice(0, trace.events.length - this.maxEventsPerTrace);
    this.exporter?.exportTrace?.(trace);
    return entry;
  }

  finishTrace(traceId, status = "success", data = {}) {
    if (!traceId) return null;
    const trace = this.traces.get(traceId) || this.startTrace({ traceId });
    trace.status = String(status || "success");
    trace.finishedAt = new Date().toISOString();
    trace.durationMs = Date.parse(trace.finishedAt) - Date.parse(trace.startedAt);
    trace.result = this.sanitize(data);
    this.record({
      traceId,
      agent: "AgentTracer",
      event: "finish",
      status: trace.status,
      data: trace.result
    });
    this.exporter?.exportTrace?.(trace);
    return trace;
  }

  getTrace(traceId) {
    return this.traces.get(traceId) || this.exporter?.readTrace?.(traceId) || null;
  }

  sanitize(value, depth = 0) {
    if (depth > 8) return "[MaxDepth]";
    if (value == null) return value;
    if (typeof value === "string") {
      const clipped = value.length > 2000 ? `${value.slice(0, 2000)}...<truncated>` : value;
      return SENSITIVE_VALUE.test(clipped) ? clipped.replace(SENSITIVE_VALUE, "***REDACTED***") : clipped;
    }
    if (typeof value === "number" || typeof value === "boolean") return value;
    if (Array.isArray(value)) return value.slice(0, 100).map((item) => this.sanitize(item, depth + 1));
    if (typeof value === "object") {
      const out = {};
      for (const [key, item] of Object.entries(value)) {
        out[key] = SENSITIVE_KEY.test(key) ? "***REDACTED***" : this.sanitize(item, depth + 1);
      }
      return out;
    }
    return String(value);
  }
}

module.exports = { EventRecorder };
