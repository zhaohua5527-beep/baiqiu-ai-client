const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DEFAULT_RESOURCE_ROOT } = require("./agent-quota-manager");

class ResourceMonitor {
  constructor({ rootDir = DEFAULT_RESOURCE_ROOT, snapshotsFile = null, now = null } = {}) {
    this.rootDir = rootDir;
    this.snapshotsFile = snapshotsFile || path.join(rootDir, "resource-snapshots.json");
    this.now = now || (() => new Date().toISOString());
    this.ensureStore();
  }

  snapshot(extra = {}) {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = Math.max(0, totalMem - freeMem);
    const cpus = os.cpus() || [];
    const item = {
      timestamp: this.now(),
      memory: {
        total: totalMem,
        free: freeMem,
        used: usedMem,
        usageRate: totalMem ? usedMem / totalMem : 0
      },
      cpu: {
        count: cpus.length,
        model: cpus[0]?.model || ""
      },
      loadAverage: typeof os.loadavg === "function" ? os.loadavg() : [],
      ...extra
    };
    const data = this.load();
    data.snapshots.push(item);
    this.save({ snapshots: data.snapshots.slice(-300) });
    return item;
  }

  getLatest() {
    const snapshots = this.load().snapshots;
    return snapshots[snapshots.length - 1] || null;
  }

  ensureStore() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.snapshotsFile)) this.save({ snapshots: [] });
  }

  load() {
    this.ensureStore();
    try {
      const parsed = JSON.parse(fs.readFileSync(this.snapshotsFile, "utf8"));
      return { snapshots: Array.isArray(parsed.snapshots) ? parsed.snapshots : [] };
    } catch {
      return { snapshots: [] };
    }
  }

  save(data = {}) {
    fs.mkdirSync(this.rootDir, { recursive: true });
    fs.writeFileSync(this.snapshotsFile, JSON.stringify({ snapshots: data.snapshots || [] }, null, 2), "utf8");
  }
}

module.exports = { ResourceMonitor };
