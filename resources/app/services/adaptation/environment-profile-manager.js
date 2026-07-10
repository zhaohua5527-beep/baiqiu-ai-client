const fs = require("node:fs");
const path = require("node:path");
const { DEFAULT_ADAPTATION_ROOT } = require("./environment-detector");

function nowIso() {
  return new Date().toISOString();
}

class EnvironmentProfileManager {
  constructor({ rootDir = DEFAULT_ADAPTATION_ROOT } = {}) {
    this.rootDir = rootDir;
    this.profilesFile = path.join(rootDir, "environment-profiles.json");
    this.ensureStore();
  }

  upsertProfile(environment = {}) {
    const profileId = environment.profileId || this.classify(environment);
    const data = this.load();
    const previous = data.profiles[profileId] || {};
    const profile = {
      profileId,
      platform: environment.platform || previous.platform || "",
      capabilities: environment.capabilities || previous.capabilities || {},
      constraints: environment.constraints || previous.constraints || {},
      strategyPreferences: this.derivePreferences(environment),
      createdAt: previous.createdAt || nowIso(),
      updatedAt: nowIso()
    };
    data.profiles[profileId] = profile;
    this.writeJson(this.profilesFile, { profiles: data.profiles });
    return profile;
  }

  getProfile(profileId = "") {
    return this.load().profiles[profileId] || null;
  }

  listProfiles() {
    return Object.values(this.load().profiles);
  }

  classify(environment = {}) {
    const platform = environment.platform || "unknown";
    const constraints = environment.constraints || {};
    if (constraints.lowMemory) return `${platform}.low_memory`;
    if (constraints.offline) return `${platform}.offline`;
    if (constraints.restrictedStorage) return `${platform}.restricted_storage`;
    return `${platform}.standard`;
  }

  derivePreferences(environment = {}) {
    const constraints = environment.constraints || {};
    const capabilities = environment.capabilities || {};
    return {
      preferLocalTools: true,
      preferLightweightPlan: Boolean(constraints.lowMemory),
      avoidNetworkDependentSteps: Boolean(constraints.offline),
      preferWorkspacePaths: Boolean(constraints.restrictedStorage || !capabilities.hasAppsDir),
      requirePermissionForHighRisk: true
    };
  }

  load() {
    return this.readJson(this.profilesFile, { profiles: {} });
  }

  ensureStore() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.profilesFile)) this.writeJson(this.profilesFile, { profiles: {} });
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

module.exports = { EnvironmentProfileManager };
