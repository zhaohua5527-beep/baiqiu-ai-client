const INTENT_TOOL_CATALOG = Object.freeze({
  "general.chat": [],
  "math.calculator": [{ id: "run_command", logicalTool: "calculator_tool", category: "math", params: () => ({ command: "start calc" }) }],
  "math.calculator.open": [{ id: "run_command", logicalTool: "calculator_tool", category: "math", params: () => ({ command: "start calc" }) }],
  "dev.code.calculator": [{ id: "calculator_creator", logicalTool: "html_app_creator", category: "dev" }],
  "dev.code": [{ id: "html_app_creator", logicalTool: "html_app_creator", category: "dev" }],
  "file.create": [{ id: "file_creator", logicalTool: "file_creator", category: "file" }],
  "folder.create": [{ id: "create_folder", logicalTool: "folder_creator", category: "file" }],
  "system.open": [{ id: "open_path", logicalTool: "system_launcher", category: "system" }],
  "system.shutdown": [{ id: "system_shutdown", logicalTool: "system_power", category: "system", riskLevel: "high", requirePermission: true }],
  "office.doc": [{ id: "write_xlsx", logicalTool: "office_doc", category: "office" }],
  "skill.learn": [{ id: "skill_install", logicalTool: "skill_registry", category: "skill" }],
  "memory.persona": [{ id: "update_profile", logicalTool: "memory_persona", category: "memory", virtual: true }]
});

const { PermissionPolicy } = require("./permission/permission-policy");
const { StrategyOptimizer } = require("./optimization/strategy-optimizer");
const { getDefaultAgentStateManager } = require("./agent_state_manager");
const { getDefaultAgentEventBus, AGENT_EVENTS } = require("./neural-core/agent-event-bus");
const permissionPolicy = new PermissionPolicy();

function metric(name, data) {
  try { require("./neural-core/agent-event-bus").recordRuntimeMetric?.(name, data); } catch {}
}

const TOOL_INTENT_CATALOG = Object.freeze({
  run_command: ["math.calculator", "math.calculator.open", "system.shutdown", "system.command"],
  execute_command: ["system.command"],
  shell_command: ["system.command"],
  open_path: ["system.open", "file.open"],
  browser_open: ["system.open", "file.open", "dev.code", "dev.code.calculator"],
  create_folder: ["file.create", "folder.create"],
  system_shutdown: ["system.shutdown"],
  skill_install: ["skill.learn"],
  install_skill: ["skill.learn"],
  calculator_creator: ["dev.code.calculator"],
  html_app_creator: ["dev.code"],
  file_creator: ["file.create"],
  write_text_file: ["file.create"],
  write_xlsx: ["office.doc", "file.create"],
  find_desktop_files: ["file.search"],
  web_search: ["realtime.web", "info.search"],
  list_skills: ["skill.learn", "skill.list"],
  read_memory: ["memory.read"],
  update_profile: ["memory.persona"]
});

function normalizeIntent(intent = "", context = {}) {
  const value = String(intent || "").trim() || "general.chat";
  const text = String(context.userMessage || context.message || context.task?.title || "").toLowerCase();
  if (value === "folder.create") return value;
  if (/关闭电脑|关机|shutdown|power\s*off/i.test(text)) return "system.shutdown";
  if (/(\u6587\u4ef6\u5939|folder)/i.test(text) && /(\u521b\u5efa|\u65b0\u5efa|create)/i.test(text)) return "folder.create";
  if (value === "dev.code.calculator") return value;
  if (value === "math.calculator.open") return "math.calculator";
  if (value === "dev.code") return value;
  return value;
}

function inferToolCategory(tool = {}) {
  const id = String(tool.id || "").toLowerCase();
  const permission = String(tool.permission?.scope || tool.permission?.level || tool.permission || "").toLowerCase();
  if (id.includes("web") || id.includes("search") || permission.includes("network")) return "network";
  if (id.includes("skill")) return "skill";
  if (id.includes("memory") || id.includes("profile")) return "memory";
  if (id.includes("xlsx") || id.includes("office")) return "office";
  if (id.includes("command") || id.includes("shell") || permission.includes("execute")) return "system";
  if (id.includes("file") || id.includes("path") || permission.includes("file")) return "file";
  return "tool";
}

function riskForTool(tool = {}) {
  const id = String(tool.id || "").toLowerCase();
  const permission = String(tool.permission?.level || tool.permission || "").toLowerCase();
  if (id.includes("command") || id.includes("shell") || permission.includes("execute") || permission.includes("admin")) return "high";
  if (permission.includes("write") || permission.includes("move") || permission.includes("recycle")) return "medium";
  return "low";
}

function enrichToolMetadata(tool = {}) {
  const policy = permissionPolicy.classify({ toolId: tool.id || "" });
  const category = tool.category || inferToolCategory(tool);
  const supportedIntent = Array.isArray(tool.supportedIntent) && tool.supportedIntent.length
    ? tool.supportedIntent
    : (TOOL_INTENT_CATALOG[tool.id] || []);
  const riskLevel = tool.riskLevel || policy.riskLevel || riskForTool(tool);
  const requirePermission = typeof tool.requirePermission === "boolean"
    ? tool.requirePermission
    : policy.requiresPermission;
  return {
    ...tool,
    category,
    supportedIntent,
    riskLevel,
    requirePermission,
    requiresPermission: typeof tool.requiresPermission === "boolean" ? tool.requiresPermission : requirePermission,
    needUserConfirm: typeof tool.needUserConfirm === "boolean" ? tool.needUserConfirm : policy.needUserConfirm,
    permissionScope: tool.permissionScope || policy.permissionScope
  };
}

class ToolSelector {
  constructor({ logger = null, skillCenter = null, capabilityCenter = null, strategyOptimizer = null, stateManager = null, eventBus = null } = {}) {
    this.logger = typeof logger === "function" ? logger : null;
    this.skillCenter = skillCenter;
    this.capabilityCenter = capabilityCenter;
    this.strategyOptimizer = strategyOptimizer || new StrategyOptimizer();
    this.stateManager = stateManager || getDefaultAgentStateManager();
    this.eventBus = eventBus || getDefaultAgentEventBus();
  }

  select({ intent = "general.chat", task = null, context = {}, availableTools = [] } = {}) {
    const startedAt = Date.now();
    const sessionId = context.sessionId || context.traceId || context.taskId || "global";
    this.eventBus.publish(AGENT_EVENTS.TOOL_SELECTED, {
      sessionId,
      intent,
      currentAgent: "tool_selector",
      taskId: task?.id || task?.taskId || context.taskId || ""
    });
    const normalizedIntent = normalizeIntent(intent, context);
    const skillTools = this.skillTools();
    const tools = [...availableTools, ...skillTools].map(enrichToolMetadata);
    const configured = normalizedIntent === "skill.use"
      ? skillTools.map((tool) => ({ id: tool.id, logicalTool: "skill_runtime", category: "skill" }))
      : (INTENT_TOOL_CATALOG[normalizedIntent] || []);
    const selectedTools = this.rankTools(configured
      .map((candidate) => this.resolveCandidate(candidate, tools))
      .filter((tool) => tool && this.isCapabilityAllowed(tool, context)), normalizedIntent);
    const confidence = selectedTools.length ? this.confidenceFor(normalizedIntent, selectedTools) : 0;
    const result = {
      selectedTools,
      reason: selectedTools.length
        ? this.reasonFor(normalizedIntent, selectedTools, task, context)
        : "该意图不需要工具，或当前没有可用工具。",
      confidence,
      intent: normalizedIntent,
      candidates: configured.map((item) => item.id)
    };
    this.trace("INFO", "[ToolSelector]", {
      intent: normalizedIntent,
      task,
      userMessage: String(context.userMessage || context.message || "").slice(0, 500),
      candidates: result.candidates,
      installedSkills: skillTools.map((item) => item.id),
      selectedTools: selectedTools.map((item) => item.id),
      reason: result.reason,
      confidence
    });
    this.eventBus.publish(AGENT_EVENTS.TOOL_SELECTED, {
      sessionId,
      id: selectedTools[0]?.id || "",
      toolId: selectedTools[0]?.id || "",
      logicalTool: selectedTools[0]?.logicalTool || "",
      intent: normalizedIntent
    });
    metric("ToolSelector.select", { duration: Date.now() - startedAt, success: selectedTools.length > 0 || normalizedIntent === "general.chat", hit: selectedTools.length > 0 });
    return result;
  }

  approveToolCall({ toolId, params = {}, intent = "", context = {}, availableTools = [] } = {}) {
    const startedAt = Date.now();
    const sessionId = context.sessionId || context.traceId || context.taskId || "global";
    this.eventBus.publish(AGENT_EVENTS.TOOL_SELECTED, {
      sessionId,
      intent: intent || context.agentIntent || "",
      toolId,
      currentAgent: "tool_selector"
    });
    const tools = availableTools.map(enrichToolMetadata);
    const tool = tools.find((item) => item.id === toolId) || enrichToolMetadata({ id: toolId });
    const normalizedIntent = normalizeIntent(intent || context.agentIntent || "", context);
    const selected = this.select({ intent: normalizedIntent, context, availableTools: tools });
    const explicitlySelected = selected.selectedTools.some((item) => item.id === toolId);
    const toolSupportsIntent = !normalizedIntent || normalizedIntent === "general.chat" || tool.supportedIntent.includes(normalizedIntent);
    const allowed = explicitlySelected || toolSupportsIntent || this.isSafeFallback(tool, context);
    const result = {
      selectedTools: allowed ? [{ ...tool, params }] : [],
      reason: allowed
        ? `工具 ${toolId} 已通过 ToolSelector 审核。`
        : `工具 ${toolId} 与意图 ${normalizedIntent || "unknown"} 不匹配，已阻止直接执行。`,
      confidence: allowed ? Math.max(selected.confidence, 0.66) : 0.1,
      intent: normalizedIntent,
      approved: allowed
    };
    this.trace(allowed ? "INFO" : "WARN", "[ToolSelector]", {
      intent: normalizedIntent,
      requestedTool: toolId,
      params: this.safeParams(params),
      approved: allowed,
      reason: result.reason
    });
    metric("ToolSelector.approve", { duration: Date.now() - startedAt, success: allowed, hit: allowed });
    return result;
  }

  resolveCandidate(candidate, tools) {
    if (candidate.virtual) return enrichToolMetadata(candidate);
    const actual = tools.find((tool) => tool.id === candidate.id);
    if (!actual) return null;
    return enrichToolMetadata({ ...actual, ...candidate });
  }

  rankTools(tools = [], intent = "") {
    const indexed = tools.map((tool, index) => ({ ...tool, __originalIndex: index }));
    return this.strategyOptimizer?.rankTools?.(indexed, { taskType: intent, intent }) || tools;
  }

  confidenceFor(intent, selectedTools) {
    if (intent === "general.chat") return 1;
    if (selectedTools.some((item) => item.virtual)) return 0.88;
    return 0.82;
  }

  reasonFor(intent, selectedTools) {
    if (intent.includes("calculator") || intent === "dev.code") return "用户需要计算器/软件能力，优先选择开发/数学工具，禁止跨到 WPS/Office。";
    if (intent.startsWith("office")) return "用户明确需要办公文档能力，选择 Office 类工具。";
    if (intent.startsWith("skill")) return "用户请求 Skill 相关能力，选择 Skill Registry。";
    if (intent.startsWith("system")) return "用户请求系统级操作，选择系统工具并保留权限控制。";
    return `根据意图 ${intent} 选择 ${selectedTools.map((item) => item.id).join(", ")}。`;
  }

  isSafeFallback(tool, context = {}) {
    const provider = String(context.provider || "").toLowerCase();
    if (provider === "realtime-web" && tool.id === "web_search") return true;
    if (provider === "direct-command") return Boolean(tool.id);
    if (/^skill_/.test(String(tool.id || ""))) return true;
    return false;
  }

  isCapabilityAllowed(tool, context = {}) {
    if (!this.capabilityCenter || tool.virtual) return true;
    const check = this.capabilityCenter.checkTool?.(tool.id, context);
    return check?.available !== false;
  }

  safeParams(params) {
    try {
      const clone = JSON.parse(JSON.stringify(params || {}));
      for (const key of Object.keys(clone)) {
        if (/apiKey|authorization|token|secret|password/i.test(key)) clone[key] = "***REDACTED***";
      }
      return clone;
    } catch {
      return {};
    }
  }

  skillTools() {
    try {
      return (this.skillCenter?.listInstalledSkills?.() || [])
        .flatMap((skill) => (Array.isArray(skill.tools) ? skill.tools : []).map((toolId) => ({
          id: toolId,
          name: skill.name || toolId,
          description: skill.description || "",
          category: "skill",
          supportedIntent: ["skill.use"],
          riskLevel: "low",
          requirePermission: false
        })));
    } catch {
      return [];
    }
  }

  trace(level, message, meta = {}) {
    if (this.logger) this.logger("agent", level, message, meta);
  }
}

module.exports = { ToolSelector, enrichToolMetadata, normalizeIntent };
