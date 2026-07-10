const fs = require("node:fs");
const path = require("node:path");
const { EnvironmentDetector, DEFAULT_ADAPTATION_ROOT } = require("./environment-detector");
const { EnvironmentProfileManager } = require("./environment-profile-manager");
const { StrategyAdapter } = require("./strategy-adapter");

function nowIso() {
  return new Date().toISOString();
}

class AdaptiveController {
  constructor({
    rootDir = DEFAULT_ADAPTATION_ROOT,
    environmentDetector = null,
    environmentProfileManager = null,
    strategyAdapter = null
  } = {}) {
    this.rootDir = rootDir;
    this.adaptationsFile = path.join(rootDir, "adaptations.json");
    this.environmentDetector = environmentDetector || new EnvironmentDetector({ rootDir });
    this.environmentProfileManager = environmentProfileManager || new EnvironmentProfileManager({ rootDir });
    this.strategyAdapter = strategyAdapter || new StrategyAdapter({ rootDir });
    this.ensureStore();
  }

  createAdaptation({ taskType = "", task = "", agentId = "default-agent", currentVersion = "unknown", environmentInput = {} } = {}) {
    const environment = this.environmentDetector.detect(environmentInput);
    const profile = this.environmentProfileManager.upsertProfile(environment);
    const strategy = this.strategyAdapter.adapt({
      taskType,
      task,
      agentId,
      environment,
      profile,
      currentVersion
    });
    const adaptation = {
      adaptationId: `adapt-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      agentId,
      taskType,
      environmentId: environment.environmentId,
      profileId: profile.profileId,
      selectedStrategy: strategy.selectedStrategy,
      strategies: strategy.strategies,
      safety: {
        advisoryOnly: true,
        modifiesPermission: false,
        bypassesToolSelector: false,
        bypassesVerifierCenter: false
      },
      timestamp: nowIso()
    };
    this.append(adaptation);
    return { adaptation, environment, profile, strategy };
  }

  append(item = {}) {
    const data = this.load();
    data.adaptations.push(item);
    this.writeJson(this.adaptationsFile, { adaptations: data.adaptations.slice(-300) });
  }

  load() {
    return this.readJson(this.adaptationsFile, { adaptations: [] });
  }

  ensureStore() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.adaptationsFile)) this.writeJson(this.adaptationsFile, { adaptations: [] });
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

module.exports = { AdaptiveController };
