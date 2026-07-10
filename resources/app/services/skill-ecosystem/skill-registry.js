const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_SKILL_ECOSYSTEM_ROOT = path.join("D:\\BaiQiuAI", "data", "skill-ecosystem");

function nowIso() {
  return new Date().toISOString();
}

function normalize(value = "") {
  return String(value || "").trim().toLowerCase();
}

function safeSkillId(value = "skill") {
  return normalize(value)
    .replace(/[^a-z0-9_\-\u4e00-\u9fa5]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    || `skill_${Date.now()}`;
}

class SkillRegistry {
  constructor({ rootDir = DEFAULT_SKILL_ECOSYSTEM_ROOT } = {}) {
    this.rootDir = rootDir;
    this.registryFile = path.join(rootDir, "skill-registry.json");
    this.ensureStore();
  }

  register(input = {}) {
    const skillId = safeSkillId(input.skillId || input.id || input.name || "skill");
    const data = this.load();
    const previous = data.skills[skillId] || {};
    const skill = {
      skillId,
      name: input.name || previous.name || skillId,
      description: input.description || previous.description || "",
      status: input.status || previous.status || "registered",
      taskTypes: Array.isArray(input.taskTypes) ? input.taskTypes : (previous.taskTypes || []),
      capabilities: Array.isArray(input.capabilities) ? input.capabilities : (previous.capabilities || []),
      workflows: Array.isArray(input.workflows) ? input.workflows : (previous.workflows || []),
      tools: Array.isArray(input.tools) ? input.tools : (previous.tools || []),
      source: input.source || previous.source || "skill_ecosystem",
      metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : (previous.metadata || {}),
      createdAt: previous.createdAt || input.createdAt || nowIso(),
      updatedAt: nowIso(),
      safety: this.safety()
    };
    data.skills[skillId] = skill;
    this.writeJson(this.registryFile, { skills: data.skills });
    return skill;
  }

  getSkill(skillId = "") {
    const key = safeSkillId(skillId);
    return this.load().skills[key] || null;
  }

  listSkills({ includeDisabled = true } = {}) {
    return Object.values(this.load().skills)
      .filter((skill) => includeDisabled || !["disabled", "deleted"].includes(skill.status));
  }

  query({ taskType = "", capability = "", keyword = "" } = {}) {
    const task = normalize(taskType);
    const cap = normalize(capability);
    const word = normalize(keyword);
    return this.listSkills().filter((skill) => {
      const taskHit = !task || (skill.taskTypes || []).some((item) => normalize(item).includes(task) || task.includes(normalize(item)));
      const capHit = !cap || (skill.capabilities || []).some((item) => normalize(item).includes(cap) || cap.includes(normalize(item)));
      const haystack = [skill.skillId, skill.name, skill.description, ...(skill.taskTypes || []), ...(skill.capabilities || [])].map(normalize).join(" ");
      const wordHit = !word || haystack.includes(word);
      return taskHit && capHit && wordHit;
    });
  }

  updateStatus(skillId = "", status = "registered", reason = "") {
    const existing = this.getSkill(skillId);
    if (!existing) return null;
    return this.register({ ...existing, status, metadata: { ...(existing.metadata || {}), statusReason: reason } });
  }

  load() {
    return this.readJson(this.registryFile, { skills: {} });
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
    if (!fs.existsSync(this.registryFile)) this.writeJson(this.registryFile, { skills: {} });
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

module.exports = { SkillRegistry, DEFAULT_SKILL_ECOSYSTEM_ROOT, safeSkillId };
