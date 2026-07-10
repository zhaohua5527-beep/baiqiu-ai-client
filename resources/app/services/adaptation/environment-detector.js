const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const DEFAULT_ADAPTATION_ROOT = path.join("D:\\BaiQiuAI", "data", "adaptation");

function nowIso() {
  return new Date().toISOString();
}

class EnvironmentDetector {
  constructor({ rootDir = DEFAULT_ADAPTATION_ROOT, now = nowIso } = {}) {
    this.rootDir = rootDir;
    this.snapshotsFile = path.join(rootDir, "environment-snapshots.json");
    this.now = now;
    this.ensureStore();
  }

  detect(input = {}) {
    const snapshot = {
      environmentId: input.environmentId || `env-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      platform: input.platform || os.platform(),
      arch: input.arch || os.arch(),
      release: input.release || os.release(),
      hostname: input.hostname || os.hostname(),
      cpuCount: Number(input.cpuCount || os.cpus().length || 0),
      memory: {
        total: Number(input.totalMemory || os.totalmem()),
        free: Number(input.freeMemory || os.freemem())
      },
      paths: {
        dataRoot: input.dataRoot || path.join("D:\\BaiQiuAI", "data"),
        workspace: input.workspace || path.join("D:\\BaiQiuAI", "data", "workspace"),
        apps: input.apps || path.join("D:\\BaiQiuAI", "data", "apps")
      },
      capabilities: {
        hasDDrive: input.hasDDrive !== undefined ? Boolean(input.hasDDrive) : fs.existsSync("D:\\"),
        hasWorkspace: input.hasWorkspace !== undefined ? Boolean(input.hasWorkspace) : fs.existsSync(path.join("D:\\BaiQiuAI", "data", "workspace")),
        hasAppsDir: input.hasAppsDir !== undefined ? Boolean(input.hasAppsDir) : fs.existsSync(path.join("D:\\BaiQiuAI", "data", "apps")),
        browserAvailable: input.browserAvailable !== undefined ? Boolean(input.browserAvailable) : true
      },
      constraints: {
        lowMemory: input.lowMemory !== undefined ? Boolean(input.lowMemory) : os.freemem() < 512 * 1024 * 1024,
        restrictedStorage: input.restrictedStorage !== undefined ? Boolean(input.restrictedStorage) : false,
        offline: input.offline !== undefined ? Boolean(input.offline) : false
      },
      timestamp: input.timestamp || this.now()
    };
    this.append(snapshot);
    return snapshot;
  }

  getLatest() {
    const snapshots = this.load().snapshots;
    return snapshots[snapshots.length - 1] || null;
  }

  append(snapshot = {}) {
    const data = this.load();
    data.snapshots.push(snapshot);
    this.writeJson(this.snapshotsFile, { snapshots: data.snapshots.slice(-200) });
  }

  load() {
    return this.readJson(this.snapshotsFile, { snapshots: [] });
  }

  ensureStore() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.snapshotsFile)) this.writeJson(this.snapshotsFile, { snapshots: [] });
  }

  readJson(file, fallback) {
    this.ensureStore();
    try {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      return fallback;
    }
  }

  writeJson(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  }
}

module.exports = { EnvironmentDetector, DEFAULT_ADAPTATION_ROOT };
