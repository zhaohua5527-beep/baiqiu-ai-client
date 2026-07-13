const fs = require("node:fs");
const path = require("node:path");
const { dataRoot } = require("./data-root");
const { randomUUID } = require("node:crypto");

const DEFAULT_ROOT = path.join(dataRoot(), "skills");

function cleanText(value, limit = 2000) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function safeId(value, fallback = "skill") {
  if (/天气|气温|下雨|预报|weather/i.test(String(value || ""))) return "weather";
  const raw = cleanText(value, 120)
    .toLowerCase()
    .replace(/全国天气|天气查询|天气|weather/g, "weather")
    .replace(/[^a-z0-9_\-\u4e00-\u9fa5]+/gi, "_")
    .replace(/^_+|_+$/g, "");
  return raw || `${fallback}_${Date.now()}`;
}

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp-${process.pid}-${Date.now()}-${randomUUID()}`;
  fs.writeFileSync(temp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(temp, file);
}

function defaultStore() {
  return {
    version: 1,
    skills: [],
    custom: [],
    memories: [],
    updatedAt: null
  };
}

class SkillCenter {
  constructor({ root = DEFAULT_ROOT, memoryCenter = null, clock = () => new Date() } = {}) {
    this.root = root;
    this.memoryCenter = memoryCenter;
    this.clock = typeof clock === "function" ? clock : () => new Date();
    this.file = path.join(this.root, "skills.json");
    this.installedDir = path.join(this.root, "installed");
    this.cacheDir = path.join(this.root, "cache");
    this.store = defaultStore();
    this.load();
  }

  now() {
    return this.clock().toISOString();
  }

  ensureRoot() {
    fs.mkdirSync(this.root, { recursive: true });
    fs.mkdirSync(this.installedDir, { recursive: true });
    fs.mkdirSync(this.cacheDir, { recursive: true });
  }

  load() {
    this.ensureRoot();
    const raw = readJson(this.file, defaultStore());
    this.store = {
      ...defaultStore(),
      ...raw,
      skills: Array.isArray(raw.skills) ? raw.skills : [],
      custom: Array.isArray(raw.custom) ? raw.custom : [],
      memories: Array.isArray(raw.memories) ? raw.memories : []
    };
    return this.snapshot();
  }

  save() {
    this.ensureRoot();
    this.store.updatedAt = this.now();
    writeJsonAtomic(this.file, this.store);
    return this.snapshot();
  }

  paths() {
    return {
      root: this.root,
      skillsJson: this.file,
      installed: this.installedDir,
      cache: this.cacheDir
    };
  }

  snapshot() {
    return JSON.parse(JSON.stringify(this.store));
  }

  readSettingsView() {
    this.load();
    return {
      custom: [...this.store.custom],
      memories: [...this.store.memories],
      skills: [...this.store.skills]
    };
  }

  writeSettingsView(data = {}) {
    this.load();
    if (Array.isArray(data.custom)) this.store.custom = data.custom;
    if (Array.isArray(data.memories)) this.store.memories = data.memories;
    if (Array.isArray(data.skills)) this.store.skills = data.skills;
    this.save();
    return this.readSettingsView();
  }

  listSkills({ includeDeleted = false } = {}) {
    this.load();
    return this.store.skills
      .filter((skill) => includeDeleted || skill.status !== "deleted")
      .map((skill) => ({ ...skill, tools: Array.isArray(skill.tools) ? [...skill.tools] : [] }));
  }

  listInstalledSkills() {
    return this.listSkills().filter((skill) => skill.status === "installed");
  }

  getSkill(idOrName) {
    const key = cleanText(idOrName, 120).toLowerCase();
    if (!key) return null;
    return this.listSkills({ includeDeleted: true }).find((skill) => {
      return String(skill.id || "").toLowerCase() === key
        || String(skill.name || "").toLowerCase() === key
        || String(skill.description || "").toLowerCase().includes(key);
    }) || null;
  }

  upsertSkill(record = {}) {
    this.load();
    const id = safeId(record.id || record.name || record.description);
    const existing = this.store.skills.find((skill) => skill.id === id);
    const next = {
      id,
      name: cleanText(record.name || existing?.name || id, 120),
      status: cleanText(record.status || existing?.status || "learning", 40),
      createdAt: existing?.createdAt || record.createdAt || this.now(),
      updatedAt: this.now(),
      tools: Array.isArray(record.tools) ? record.tools : (existing?.tools || []),
      description: cleanText(record.description || existing?.description || "", 500),
      source: cleanText(record.source || existing?.source || "", 500),
      reason: cleanText(record.reason || "", 500),
      metadata: record.metadata && typeof record.metadata === "object" ? record.metadata : (existing?.metadata || {})
    };
    this.store.skills = [next, ...this.store.skills.filter((skill) => skill.id !== id && !(id === "weather" && /天气|weather/i.test(`${skill.id || ""} ${skill.name || ""}`)))];
    this.save();
    return next;
  }

  createSkillRecord({ name, description = "", tools = [], source = "manual", status = "installed", metadata = {} } = {}) {
    const record = this.upsertSkill({ id: safeId(name), name, description, tools, source, status, metadata });
    if (record.status === "installed") this.rememberInstalledSkill(record);
    return {
      success: record.status === "installed",
      status: record.status,
      skill: record,
      verification: this.verifySkill(record.id)
    };
  }

  learnSkillFromRequest(message = {}) {
    const text = typeof message === "string" ? message : cleanText(message.text || message.source || message.name || "", 1000);
    const name = this.extractSkillName(text);
    const missing = this.missingCapabilityFor(name, text);
    if (missing) {
      const skill = this.upsertSkill({
        id: safeId(name || "weather"),
        name: name || "全国天气查询",
        description: "用户请求学习的技能，但当前缺少真实外部能力，未安装。",
        source: text,
        status: "learning",
        reason: missing,
        tools: []
      });
      return {
        success: false,
        status: "failed",
        skill,
        error: missing,
        verification: this.verifySkill(skill.id)
      };
    }
    return this.createSkillRecord({
      name,
      description: `用户学习的本地技能：${name}`,
      source: text,
      status: "installed",
      tools: []
    });
  }

  extractSkillName(text) {
    const value = cleanText(text, 200);
    const match = value.match(/学习(?:一个|一下)?\s*(.+?)(?:skill|技能)?$/i)
      || value.match(/(?:创建|保存|安装)(?:一个|一下)?\s*(.+?)(?:skill|技能)$/i);
    const raw = cleanText(match?.[1] || value.replace(/skill/ig, "").replace(/技能/g, ""), 80);
    if (/天气/.test(raw)) return "全国天气查询";
    return raw || "自定义技能";
  }

  missingCapabilityFor(name, text) {
    const value = `${name || ""} ${text || ""}`;
    if (/天气|气温|下雨|预报|weather/i.test(value)) {
      return "缺少真实天气查询工具或天气 API，不能把聊天记录伪装成已安装技能。";
    }
    return "";
  }

  verifySkill(id) {
    const skill = this.getSkill(id);
    const checks = [
      { name: "record_exists", passed: Boolean(skill) },
      { name: "not_deleted", passed: Boolean(skill && skill.status !== "deleted") },
      { name: "installed_status", passed: Boolean(skill && skill.status === "installed") }
    ];
    return {
      verified: checks.every((check) => check.passed),
      status: checks.every((check) => check.passed) ? "passed" : "failed",
      checks,
      reason: checks.every((check) => check.passed) ? "" : (skill?.reason || "技能未安装。")
    };
  }

  disableSkill(idOrName) {
    const skill = this.getSkill(idOrName);
    if (!skill) return { success: false, error: "技能不存在" };
    return { success: true, skill: this.upsertSkill({ ...skill, status: "disabled" }) };
  }

  deleteSkill(idOrName) {
    const skill = this.getSkill(idOrName);
    if (!skill) return { success: false, error: "技能不存在" };
    return { success: true, skill: this.upsertSkill({ ...skill, status: "deleted" }) };
  }

  rememberInstalledSkill(skill) {
    try {
      this.memoryCenter?.setLegacy?.(`已安装技能:${skill.id}`, skill.name || skill.id);
    } catch {}
  }
}

module.exports = { SkillCenter, DEFAULT_ROOT };
