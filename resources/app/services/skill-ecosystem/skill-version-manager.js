const fs = require("node:fs");
const path = require("node:path");
const { DEFAULT_SKILL_ECOSYSTEM_ROOT, safeSkillId } = require("./skill-registry");

function nowIso() {
  return new Date().toISOString();
}

class SkillVersionManager {
  constructor({ rootDir = DEFAULT_SKILL_ECOSYSTEM_ROOT } = {}) {
    this.rootDir = rootDir;
    this.versionsFile = path.join(rootDir, "skill-versions.json");
    this.ensureStore();
  }

  createVersion(skill = {}, patch = {}) {
    const skillId = safeSkillId(skill.skillId || skill.id || skill.name || "skill");
    const data = this.load();
    const versions = data.versions[skillId] || [];
    const version = patch.version || this.nextVersion(versions);
    const record = {
      skillId,
      version,
      status: patch.status || skill.status || "registered",
      changes: patch.changes || "skill metadata updated",
      capabilities: Array.isArray(skill.capabilities) ? skill.capabilities : [],
      taskTypes: Array.isArray(skill.taskTypes) ? skill.taskTypes : [],
      safety: this.safety(),
      timestamp: nowIso()
    };
    data.versions[skillId] = [...versions, record].slice(-100);
    this.writeJson(this.versionsFile, { versions: data.versions });
    return record;
  }

  getLatest(skillId = "") {
    const versions = this.listVersions(skillId);
    return versions[versions.length - 1] || null;
  }

  listVersions(skillId = "") {
    return this.load().versions[safeSkillId(skillId)] || [];
  }

  nextVersion(versions = []) {
    if (!versions.length) return "1.0.0";
    const latest = versions[versions.length - 1].version || "1.0.0";
    const parts = latest.split(".").map((item) => Number(item) || 0);
    parts[2] += 1;
    return parts.join(".");
  }

  load() {
    return this.readJson(this.versionsFile, { versions: {} });
  }

  safety() {
    return {
      skillManagementOnly: true,
      executesTool: false,
      bypassesToolSelector: false,
      bypassesVerifierCenter: false
    };
  }

  ensureStore() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.versionsFile)) this.writeJson(this.versionsFile, { versions: {} });
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

module.exports = { SkillVersionManager };
