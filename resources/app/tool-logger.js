const fs = require("node:fs");
const path = require("node:path");

class ToolLogger {
  constructor(file, options = {}) {
    this.file = file;
    this.developer = Boolean(options.developer);
  }

  log(entry) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.appendFileSync(this.file, `${JSON.stringify(entry)}\n`, "utf8");
    if (!this.developer) return;
    const devLog = path.join(path.dirname(this.file), "system.log");
    fs.appendFileSync(devLog, `${JSON.stringify({
      at: new Date().toISOString(),
      level: entry.error ? "ERROR" : "INFO",
      source: "tool",
      message: `[Tool] ${entry.toolId || entry.toolName || "unknown"}`,
      meta: {
        toolName: entry.toolName,
        toolId: entry.toolId,
        input: entry.parameters,
        output: entry.result,
        error: entry.error,
        duration: entry.duration
      }
    })}\n`, "utf8");
  }
}

module.exports = { ToolLogger };
