const fs = require("node:fs");
const path = require("node:path");
const { dataRoot } = require("../data-root");

const DEFAULT_IDENTITY_ROOT = path.join(dataRoot(), "identity");

function nowIso() {
  return new Date().toISOString();
}

class AgentProfileManager {
  constructor({ rootDir = DEFAULT_IDENTITY_ROOT } = {}) {
    this.rootDir = rootDir;
    this.filePath = path.join(rootDir, "profiles.json");
    this.ensureStore();
  }

  upsertProfile(agentId = "", profile = {}) {
    const id = agentId || profile.agentId || "default-agent";
    const data = this.load();
    const previous = data.profiles[id] || {};
    const next = {
      agentId: id,
      name: profile.name || previous.name || id,
      role: profile.role || previous.role || "agent",
      capabilities: Array.isArray(profile.capabilities) ? profile.capabilities : (previous.capabilities || []),
      preferences: Array.isArray(profile.preferences) ? profile.preferences : (previous.preferences || []),
      metadata: { ...(previous.metadata || {}), ...(profile.metadata || {}) },
      createdAt: previous.createdAt || nowIso(),
      updatedAt: nowIso()
    };
    data.profiles[id] = next;
    this.save(data);
    return next;
  }

  getProfile(agentId = "") {
    return this.load().profiles[agentId] || null;
  }

  listProfiles() {
    return Object.values(this.load().profiles);
  }

  ensureStore() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.filePath)) this.save({ profiles: {} });
  }

  load() {
    this.ensureStore();
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      return { profiles: parsed.profiles && typeof parsed.profiles === "object" ? parsed.profiles : {} };
    } catch {
      return { profiles: {} };
    }
  }

  save(data = {}) {
    fs.mkdirSync(this.rootDir, { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify({ profiles: data.profiles || {} }, null, 2), "utf8");
  }
}

module.exports = { AgentProfileManager, DEFAULT_IDENTITY_ROOT };
