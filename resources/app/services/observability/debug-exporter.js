const fs = require("node:fs");
const path = require("node:path");

const TRACE_DIR = path.join("D:\\BaiQiuAI", "data", "logs", "trace");

class DebugExporter {
  constructor({ traceDir = TRACE_DIR } = {}) {
    this.traceDir = traceDir;
    this.ensureDir();
  }

  ensureDir() {
    fs.mkdirSync(this.traceDir, { recursive: true });
  }

  fileFor(traceId) {
    const safe = String(traceId || "unknown").replace(/[^a-zA-Z0-9_.-]/g, "_");
    return path.join(this.traceDir, `trace-${safe}.json`);
  }

  exportTrace(trace = {}) {
    this.ensureDir();
    const file = this.fileFor(trace.traceId);
    fs.writeFileSync(file, JSON.stringify(trace, null, 2), "utf8");
    return file;
  }

  readTrace(traceId) {
    const file = this.fileFor(traceId);
    if (!fs.existsSync(file)) return null;
    try {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      return null;
    }
  }

  listRecent(limit = 10) {
    this.ensureDir();
    const files = fs.readdirSync(this.traceDir)
      .filter((name) => /^trace-.+\.json$/i.test(name))
      .map((name) => {
        const file = path.join(this.traceDir, name);
        const stat = fs.statSync(file);
        return { file, name, mtimeMs: stat.mtimeMs };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
      .slice(0, Math.max(1, Math.min(50, Number(limit) || 10)));

    return files.map((item) => {
      try {
        const trace = JSON.parse(fs.readFileSync(item.file, "utf8"));
        return {
          traceId: trace.traceId,
          status: trace.status || "running",
          startedAt: trace.startedAt || "",
          finishedAt: trace.finishedAt || "",
          durationMs: trace.durationMs || 0,
          userMessage: trace.userMessage || "",
          result: trace.result || {},
          file: item.file
        };
      } catch {
        return {
          traceId: item.name.replace(/^trace-|\.json$/g, ""),
          status: "unreadable",
          startedAt: "",
          finishedAt: "",
          durationMs: 0,
          userMessage: "",
          result: {},
          file: item.file
        };
      }
    });
  }
}

module.exports = { DebugExporter, TRACE_DIR };
