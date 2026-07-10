const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const DEFAULT_ROOT = path.join("D:\\BaiQiuAI", "data", "capabilities");

function cleanText(value, limit = 2000) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
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
    capabilities: [],
    updatedAt: null
  };
}

function normalizeId(value) {
  return cleanText(value, 120)
    .toLowerCase()
    .replace(/[^a-z0-9_\-\u4e00-\u9fa5]+/gi, "_")
    .replace(/^_+|_+$/g, "");
}

function categoryFromTool(tool = {}) {
  const id = String(tool.id || "").toLowerCase();
  const category = String(tool.category || "").toLowerCase();
  if (id.includes("calculator")) return "software";
  if (id.includes("html")) return "software";
  if (id.includes("xlsx") || id.includes("spreadsheet")) return "excel";
  if (id.includes("file") || id.includes("path")) return "file";
  if (id.includes("browser") || id.includes("open")) return "system";
  if (id.includes("web") || category.includes("network")) return "network";
  if (id.includes("skill")) return "skill";
  return category || "tool";
}

class CapabilityCenter {
  constructor({
    root = DEFAULT_ROOT,
    skillCenter = null,
    memoryCenter = null,
    toolRegistryProvider = null,
    clock = () => new Date()
  } = {}) {
    this.root = root;
    this.file = path.join(this.root, "capabilities.json");
    this.skillCenter = skillCenter;
    this.memoryCenter = memoryCenter;
    this.toolRegistryProvider = typeof toolRegistryProvider === "function" ? toolRegistryProvider : null;
    this.clock = typeof clock === "function" ? clock : () => new Date();
    this.store = defaultStore();
    this.load();
  }

  now() {
    return this.clock().toISOString();
  }

  ensureRoot() {
    fs.mkdirSync(this.root, { recursive: true });
  }

  paths() {
    return {
      root: this.root,
      capabilitiesJson: this.file
    };
  }

  load() {
    this.ensureRoot();
    const raw = readJson(this.file, defaultStore());
    this.store = {
      ...defaultStore(),
      ...raw,
      capabilities: Array.isArray(raw.capabilities) ? raw.capabilities : []
    };
    return this.snapshot();
  }

  save() {
    this.ensureRoot();
    this.store.updatedAt = this.now();
    writeJsonAtomic(this.file, this.store);
    return this.snapshot();
  }

  snapshot() {
    return JSON.parse(JSON.stringify(this.store));
  }

  refresh({ tools = null, skills = null } = {}) {
    const capabilities = [
      ...this.agentCapabilities(),
      ...this.systemCapabilities(),
      ...this.toolCapabilities(tools),
      ...this.skillCapabilities(skills)
    ];
    const byId = new Map();
    for (const capability of capabilities) {
      if (!capability.id) continue;
      byId.set(capability.id, {
        dependencies: [],
        ...capability,
        updatedAt: this.now()
      });
    }
    this.store.capabilities = [...byId.values()].sort((a, b) => String(a.id).localeCompare(String(b.id)));
    this.save();
    return this.listCapabilities();
  }

  listCapabilities({ includeMissing = true } = {}) {
    this.load();
    return this.store.capabilities
      .filter((item) => includeMissing || item.status === "available")
      .map((item) => ({ ...item, dependencies: Array.isArray(item.dependencies) ? [...item.dependencies] : [] }));
  }

  getCapability(id) {
    const key = cleanText(id, 120).toLowerCase();
    if (!key) return null;
    return this.listCapabilities().find((item) => String(item.id || "").toLowerCase() === key || String(item.source || "").toLowerCase() === key) || null;
  }

  hasCapability(id) {
    const capability = this.getCapability(id);
    return Boolean(capability && capability.status === "available");
  }

  checkRequirement(requirement, context = {}) {
    const id = normalizeId(requirement);
    const text = cleanText(context.userMessage || context.message || context.text || "", 1000);
    const mapped = this.mapRequirement(id, text);
    if (!mapped) return { available: true, status: "unknown", capability: null, missing: [] };
    const capability = this.getCapability(mapped);
    const available = Boolean(capability && capability.status === "available");
    return {
      available,
      status: available ? "available" : "missing",
      capability,
      missing: available ? [] : [mapped],
      reason: available ? "" : this.missingReason(mapped, text)
    };
  }

  checkTool(toolId, context = {}) {
    const tool = cleanText(toolId, 120);
    if (!tool) return { available: false, status: "missing", reason: "工具为空。" };
    if (/^skill_/.test(tool)) {
      const skillCapability = this.listCapabilities().find((item) => item.type === "skill" && item.status === "available" && (item.dependencies || []).includes(tool));
      return skillCapability
        ? { available: true, status: "available", capability: skillCapability }
        : { available: false, status: "missing", reason: `缺少技能能力：${tool}` };
    }
    const capability = this.getCapability(`tool.${tool}`) || this.getCapability(tool);
    if (capability?.status === "available") return { available: true, status: "available", capability };
    if (tool === "web_search" && /天气|气温|下雨|预报|weather/i.test(context.userMessage || "")) {
      return { available: false, status: "missing", reason: this.missingReason("weather.query", context.userMessage || "") };
    }
    return { available: Boolean(capability), status: capability?.status || "missing", capability: capability || null, reason: capability?.reason || "" };
  }

  canPlanIntent(intent, context = {}) {
    const normalized = cleanText(intent, 120);
    if (normalized === "info.weather_or_reminder" || /天气|气温|下雨|预报|weather/i.test(context.userMessage || "")) {
      return this.checkRequirement("weather.query", context);
    }
    if (normalized === "dev.code.calculator") return this.checkRequirement("calculator_creator", context);
    if (normalized === "dev.code") return this.checkRequirement("html_app_creator", context);
    if (normalized === "file.create") return this.checkRequirement("file_creator", context);
    return { available: true, status: "available", missing: [] };
  }

  mapRequirement(requirement, text = "") {
    const value = `${requirement} ${text}`;
    if (/天气|气温|下雨|预报|weather/i.test(value)) return "weather.query";
    if (/calculator_creator|计算器|calculator/i.test(value)) return "tool.calculator_creator";
    if (/html_app_creator|html|软件|程序|应用/i.test(value)) return "tool.html_app_creator";
    if (/file_creator|文件|txt|file/i.test(value)) return "tool.file_creator";
    if (/excel|xlsx|表格|spreadsheet/i.test(value)) return "excel.analysis";
    return requirement ? `tool.${requirement}` : "";
  }

  missingReason(capabilityId, text = "") {
    if (capabilityId === "weather.query") return "缺少真实天气查询能力，不能假装完成天气查询。";
    if (capabilityId === "excel.analysis") return "缺少已验证的 Excel 分析能力，不能假装完成表格分析。";
    return `缺少能力：${capabilityId || cleanText(text, 80)}`;
  }

  agentCapabilities() {
    return [
      {
        id: "agent.planning",
        name: "任务规划",
        type: "agent",
        status: "available",
        source: "PlannerAgent",
        description: "理解用户需求并生成任务计划"
      },
      {
        id: "agent.task_queue",
        name: "连续任务编排",
        type: "agent",
        status: "available",
        source: "TaskOrchestrator",
        description: "按队列执行多步骤任务并处理中断"
      },
      {
        id: "agent.verify_reply",
        name: "验证后回复",
        type: "agent",
        status: "available",
        source: "VerifierCenter/ReplyBuilder",
        description: "工具结果验证后再生成用户回复"
      }
    ];
  }

  systemCapabilities() {
    return [
      {
        id: "system.file_access",
        name: "文件访问",
        type: "system",
        status: "available",
        source: "local_filesystem",
        description: "访问本机允许范围内的文件"
      },
      {
        id: "system.open_program",
        name: "打开程序",
        type: "system",
        status: "available",
        source: "electron_shell",
        description: "打开本地文件、网页或程序"
      },
      {
        id: "weather.query",
        name: "真实天气查询",
        type: "system",
        status: "missing",
        source: "weather_api",
        dependencies: ["weather_api"],
        description: "当前未接入真实天气 API"
      }
    ];
  }

  toolCapabilities(tools = null) {
    const sourceTools = Array.isArray(tools) ? tools : this.readTools();
    return sourceTools.map((tool) => ({
      id: `tool.${tool.id}`,
      name: tool.name || tool.id,
      type: "tool",
      status: "available",
      source: tool.id,
      category: categoryFromTool(tool),
      dependencies: [],
      description: tool.description || ""
    }));
  }

  skillCapabilities(skills = null) {
    const sourceSkills = Array.isArray(skills) ? skills : this.readSkills();
    return sourceSkills.map((skill) => ({
      id: `skill.${skill.id || normalizeId(skill.name)}`,
      name: skill.name || skill.id,
      type: "skill",
      status: skill.status === "installed" ? "available" : (skill.status || "missing"),
      source: skill.id || skill.name,
      dependencies: Array.isArray(skill.tools) ? skill.tools : [],
      description: skill.description || skill.reason || ""
    }));
  }

  readTools() {
    try {
      const registry = this.toolRegistryProvider?.();
      return registry?.list?.() || [];
    } catch {
      return [];
    }
  }

  readSkills() {
    try {
      return this.skillCenter?.listSkills?.() || [];
    } catch {
      return [];
    }
  }

  rememberCapability(capability) {
    try {
      if (capability?.status === "available") this.memoryCenter?.setLegacy?.(`可用能力:${capability.id}`, capability.name || capability.id);
    } catch {}
  }
}

module.exports = { CapabilityCenter, DEFAULT_ROOT };
