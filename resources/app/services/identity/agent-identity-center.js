const fs = require("node:fs");
const path = require("node:path");
const { AgentProfileManager, DEFAULT_IDENTITY_ROOT } = require("./agent-profile-manager");
const { AgentLifecycleManager } = require("./agent-lifecycle-manager");
const { AgentContinuityMemory } = require("./agent-continuity-memory");

function nowIso() {
  return new Date().toISOString();
}

class AgentIdentityCenter {
  constructor({ rootDir = DEFAULT_IDENTITY_ROOT, profileManager = null, lifecycleManager = null, continuityMemory = null } = {}) {
    this.rootDir = rootDir;
    this.identitiesFile = path.join(rootDir, "identities.json");
    this.profileManager = profileManager || new AgentProfileManager({ rootDir });
    this.lifecycleManager = lifecycleManager || new AgentLifecycleManager({ rootDir });
    this.continuityMemory = continuityMemory || new AgentContinuityMemory({ rootDir });
    this.ensureStore();
  }

  registerAgent(input = {}) {
    const agentId = input.agentId || input.id || `agent-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const profile = this.profileManager.upsertProfile(agentId, input.profile || input);
    const lifecycle = this.lifecycleManager.transition(agentId, "registered", { role: profile.role });
    const continuity = this.continuityMemory.saveSnapshot(agentId);
    const data = this.load();
    const identity = {
      agentId,
      profileId: profile.agentId,
      status: lifecycle.status,
      continuityUpdatedAt: continuity.updatedAt,
      createdAt: data.identities[agentId]?.createdAt || nowIso(),
      updatedAt: nowIso()
    };
    data.identities[agentId] = identity;
    this.save(data);
    return { identity, profile, lifecycle, continuity };
  }

  getIdentity(agentId = "") {
    const identity = this.load().identities[agentId] || null;
    if (!identity) return null;
    return {
      identity,
      profile: this.profileManager.getProfile(agentId),
      lifecycle: this.lifecycleManager.getState(agentId),
      continuity: this.continuityMemory.getSnapshot(agentId)
    };
  }

  refreshContinuity(agentId = "") {
    const continuity = this.continuityMemory.saveSnapshot(agentId || "default-agent");
    const data = this.load();
    if (data.identities[agentId]) {
      data.identities[agentId].continuityUpdatedAt = continuity.updatedAt;
      data.identities[agentId].updatedAt = nowIso();
      this.save(data);
    }
    return continuity;
  }

  listIdentities() {
    return Object.values(this.load().identities);
  }

  ensureStore() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.identitiesFile)) this.save({ identities: {} });
  }

  load() {
    this.ensureStore();
    try {
      const parsed = JSON.parse(fs.readFileSync(this.identitiesFile, "utf8"));
      return { identities: parsed.identities && typeof parsed.identities === "object" ? parsed.identities : {} };
    } catch {
      return { identities: {} };
    }
  }

  save(data = {}) {
    fs.mkdirSync(this.rootDir, { recursive: true });
    fs.writeFileSync(this.identitiesFile, JSON.stringify({ identities: data.identities || {} }, null, 2), "utf8");
  }
}

module.exports = { AgentIdentityCenter, DEFAULT_IDENTITY_ROOT };
