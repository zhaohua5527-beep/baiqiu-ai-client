const { DebugExporter } = require("./debug-exporter");
const { EventRecorder } = require("./event-recorder");

class AgentTracer {
  constructor({ exporter = null, recorder = null } = {}) {
    this.exporter = exporter || new DebugExporter();
    this.recorder = recorder || new EventRecorder({ exporter: this.exporter });
  }

  createTraceId(date = new Date()) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const prefix = `BQ-${yyyy}${mm}${dd}`;
    const existing = this.exporter.listRecent(50)
      .map((item) => String(item.traceId || ""))
      .filter((id) => id.startsWith(prefix));
    const next = existing.reduce((max, id) => {
      const value = Number((id.match(/-(\d+)$/) || [])[1] || 0);
      return Math.max(max, value);
    }, 0) + 1;
    return `${prefix}-${String(next).padStart(3, "0")}`;
  }

  startTrace({ traceId = "", userMessage = "", sessionId = "" } = {}) {
    const id = traceId || this.createTraceId();
    this.recorder.startTrace({ traceId: id, userMessage, sessionId });
    return id;
  }

  record(traceId, agent, event, status = "info", data = {}) {
    return this.recorder.record({ traceId, agent, event, status, data });
  }

  recordGovernance(traceId, event, status = "info", data = {}) {
    return this.record(traceId, "Governance", event, status, data);
  }

  finishTrace(traceId, status = "success", data = {}) {
    return this.recorder.finishTrace(traceId, status, data);
  }

  recent(limit = 10) {
    return this.exporter.listRecent(limit);
  }

  formatRecent(limit = 5) {
    const items = this.recent(limit);
    if (!items.length) return "最近任务日志：\n\n暂无任务追踪记录。";
    const lines = ["最近任务日志：", ""];
    items.forEach((item, index) => {
      lines.push(`${index + 1}. ${item.traceId || "unknown"}`);
      lines.push(`状态：${item.status || "unknown"}`);
      lines.push(`耗时：${Number(item.durationMs || 0)}ms`);
      lines.push(`结果：${item.result?.status || item.result?.message || item.status || "无"}`);
      if (item.userMessage) lines.push(`输入：${String(item.userMessage).slice(0, 80)}`);
      lines.push("");
    });
    return lines.join("\n").trim();
  }
}

module.exports = { AgentTracer };
