const fs = require("node:fs");
const path = require("node:path");
const { dataRoot } = require("../data-root");

class RegressionManager {
  constructor({ rootDir } = {}) {
    this.rootDir = rootDir || path.join(dataRoot(), "simulation");
    fs.mkdirSync(this.rootDir, { recursive: true });
    this.baselineFile = path.join(this.rootDir, "baseline.json");
    this.compareFile = path.join(this.rootDir, "compare.json");
  }

  saveBaseline(report = {}) {
    this.writeJson(this.baselineFile, report);
    return this.baselineFile;
  }

  saveCompare(report = {}) {
    this.writeJson(this.compareFile, report);
    return this.compareFile;
  }

  loadBaseline() {
    return this.readJson(this.baselineFile, null);
  }

  compare(current = {}, baseline = this.loadBaseline()) {
    if (!baseline) {
      this.saveBaseline(current);
      return {
        status: "KEEP",
        reason: "baseline_created",
        baseline: null,
        current: {
          successRate: Number(current?.benchmark?.successRate ?? current?.successRate ?? 0),
          total: Number(current?.benchmark?.total ?? current?.total ?? 0)
        }
      };
    }
    this.saveCompare(current);
    const before = Number(baseline?.benchmark?.successRate ?? baseline?.successRate ?? 0);
    const after = Number(current?.benchmark?.successRate ?? current?.successRate ?? 0);
    let status = "KEEP";
    if (after > before) status = "PASS";
    if (after < before) status = "WARNING";
    return {
      status,
      before,
      after,
      delta: after - before,
      reason: status === "PASS" ? "success improved" : (status === "WARNING" ? "success decreased" : "no change")
    };
  }

  writeJson(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  }

  readJson(file, fallback) {
    try {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      return fallback;
    }
  }
}

module.exports = { RegressionManager };
