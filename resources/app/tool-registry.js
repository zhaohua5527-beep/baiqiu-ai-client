const { enrichToolMetadata } = require("./services/tool-selector");

class ToolRegistry {
  constructor({ context = {}, logger = null } = {}) {
    this.context = context;
    this.logger = logger || context.logger || null;
    this.tools = new Map();
    this._permissionManager = null;
    this._pendingConfirmations = new Map();
    this._mainWindow = null;
  }

  setPermissionManager(manager) {
    this._permissionManager = manager;
  }

  setMainWindow(mainWindow) {
    this._mainWindow = mainWindow || null;
  }

  register(tool) {
    validateTool(tool);
    if (this.tools.has(tool.id)) throw new Error(`Tool already registered: ${tool.id}`);
    this.tools.set(tool.id, enrichToolMetadata({ ...tool, parameters: normalizeParameters(tool.parameters) }));
    return this.get(tool.id);
  }

  unregister(id) {
    return this.tools.delete(String(id || ""));
  }

  get(id) {
    return this.tools.get(String(id || "")) || null;
  }

  list() {
    return [...this.tools.values()].map(({ execute, ...schema }) => enrichToolMetadata({ ...schema }));
  }

  async execute(id, parameters = {}, contextPatch = {}) {
    const toolId = String(id || "");
    const tool = this.get(toolId);
    const startedAt = new Date();
    const startMs = Date.now();
    const entry = {
      startedAt: startedAt.toISOString(),
      endedAt: null,
      toolId,
      toolName: tool?.name || toolId || "unknown",
      parameters: safeSnapshot(parameters),
      result: null,
      error: null,
      duration: 0
    };

    if (!tool) {
      const response = normalizeToolResponse({
        success: false,
        result: null,
        error: `未识别动作：${toolId || "unknown"}`,
        evidence: []
      }, startMs);
      entry.endedAt = new Date().toISOString();
      entry.error = response.error;
      entry.duration = response.duration;
      this.log(entry);
      return response;
    }

    const toolContext = {
      ...this.context,
      ...contextPatch,
      tool,
      registry: this
    };
    const permissionTool = {
      ...tool,
      permission: this._permissionLevel(tool.permission),
      permissionScope: this._permissionScope(tool.permission, tool)
    };
    const permissionManager = this._permissionManager;
    if (permissionManager) {
      const checkResult = permissionManager.check(permissionTool, toolContext);
      this.context.auditLogger?.permissionCheck?.(toolId, checkResult.required, checkResult.current, checkResult.allowed, checkResult.message);
      if (!checkResult.allowed) {
        const response = {
          success: false,
          result: null,
          error: {
            code: "PERMISSION_DENIED",
            message: checkResult.message,
            requiredPermission: checkResult.required,
            currentPermission: checkResult.current
          },
          evidence: { toolId, params: this._sanitizeForEvidence(parameters) },
          duration: 0
        };
        entry.endedAt = new Date().toISOString();
        entry.error = response.error;
        entry.duration = response.duration;
        this.log(entry);
        this.context.auditLogger?.toolExecute?.(toolId, parameters, toolContext, response, response.duration);
        return response;
      }

      if (permissionManager.requiresConfirmation?.(permissionTool)) {
        const confirmResult = await this._requestChatConfirmation(permissionTool, parameters, toolContext);
        this.context.auditLogger?.confirmation?.(toolId, confirmResult.confirmed, parameters);
        if (confirmResult.mode === "allow_always") {
          permissionManager.trustTool?.(toolId);
          permissionManager.rememberMode?.(permissionTool.permissionScope, "allow_always");
        } else if (confirmResult.mode === "deny") {
          permissionManager.rememberMode?.(permissionTool.permissionScope, "deny");
        } else if (confirmResult.mode === "ask") {
          permissionManager.revokeTrust?.(toolId);
          permissionManager.rememberMode?.(permissionTool.permissionScope, "ask");
        }
        if (!confirmResult.confirmed) {
          const response = {
            success: false,
            result: null,
            error: {
              code: "CANCELLED",
              message: "用户取消操作"
            },
            evidence: { toolId, params: this._sanitizeForEvidence(parameters) },
            duration: 0
          };
          entry.endedAt = new Date().toISOString();
          entry.error = response.error;
          entry.duration = response.duration;
          this.log(entry);
          this.context.auditLogger?.toolExecute?.(toolId, parameters, toolContext, response, response.duration);
          return response;
        }
      }
    }

    try {
      const output = await tool.execute(parameters, toolContext);
      const response = normalizeToolResponse(output, startMs);
      entry.endedAt = new Date().toISOString();
      entry.result = safeSnapshot(response.result);
      entry.error = response.error;
      entry.duration = response.duration;
      this.log(entry);
      this.context.auditLogger?.toolExecute?.(toolId, parameters, toolContext, response, response.duration);
      return response;
    } catch (error) {
      this.context.auditLogger?.error?.(toolId, error, toolContext);
      const response = normalizeToolResponse({
        success: false,
        result: null,
        error: error?.message || String(error),
        evidence: []
      }, startMs);
      entry.endedAt = new Date().toISOString();
      entry.error = response.error;
      entry.duration = response.duration;
      this.log(entry);
      this.context.auditLogger?.toolExecute?.(toolId, parameters, toolContext, response, response.duration);
      return response;
    }
  }

  log(entry) {
    try {
      this.logger?.log?.(entry);
    } catch {
      // Tool logging must never break tool execution.
    }
  }

  _sanitizeForEvidence(obj) {
    if (!obj || typeof obj !== "object") return obj;
    const copy = { ...obj };
    const sensitive = ["password", "token", "apiKey", "secret", "key"];
    for (const key of sensitive) {
      if (copy[key]) copy[key] = "***REDACTED***";
    }
    return copy;
  }

  _permissionLevel(permission) {
    if (typeof permission === "string") return permission;
    const level = String(permission?.level || "").toLowerCase();
    if (level.includes("skill.execute")) return "read";
    if (level.includes("execute") || level.includes("appwrite") || level.includes("admin")) return "admin";
    if (level.includes("write") || level.includes("move") || level.includes("recycle")) return "write";
    return "read";
  }

  _permissionScope(permission, tool) {
    const rawScope = String(permission?.scope || "").toLowerCase();
    const level = this._permissionLevel(permission);
    const id = String(tool?.id || "").toLowerCase();
    if (rawScope.includes("network") || id.includes("web") || id.includes("search")) return "network";
    if (rawScope.includes("file") || rawScope.includes("desktop") || rawScope.includes("filesystem") || level === "write") return "file";
    if (level === "admin" || id.includes("command") || id.includes("shell")) return "system";
    return "tool";
  }

  async _requestChatConfirmation(tool, params, context) {
    const toolId = String(tool?.id || "");
    const confirmId = `confirm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let resolveFn;
    const promise = new Promise((resolve) => { resolveFn = resolve; });
    this._pendingConfirmations.set(confirmId, { tool, params, context, resolve: resolveFn });

    if (!this._mainWindow || this._mainWindow.isDestroyed?.()) {
      this._pendingConfirmations.delete(confirmId);
      return { confirmed: false };
    }

    this._mainWindow.webContents.send("tool:confirmation-request", {
      id: confirmId,
      toolName: tool.name || toolId,
      toolId,
      scope: tool.permissionScope || "tool",
      mode: this._permissionManager?.modeFor?.(tool) || "ask",
      params: this._sanitizeForEvidence(params),
      message: `确认执行「${tool.name || toolId}」？`
    });

    const timeout = new Promise((resolve) => {
      setTimeout(() => resolve({ confirmed: false, timeout: true }), 10 * 60 * 1000);
    });
    const result = await Promise.race([promise, timeout]);
    this._pendingConfirmations.delete(confirmId);
    return result || { confirmed: false };
  }
}

function validateTool(tool) {
  if (!tool || typeof tool !== "object") throw new Error("Tool schema must be an object");
  for (const key of ["id", "name", "description", "parameters", "permission", "execute"]) {
    if (!(key in tool)) throw new Error(`Tool schema missing required field: ${key}`);
  }
  if (!String(tool.id || "").trim()) throw new Error("Tool id is required");
  if (typeof tool.execute !== "function") throw new Error(`Tool execute must be a function: ${tool.id}`);
}

function normalizeParameters(parameters) {
  if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)) {
    return { type: "object", properties: {}, required: [] };
  }
  return {
    ...parameters,
    type: parameters.type || "object",
    properties: parameters.properties && typeof parameters.properties === "object" ? parameters.properties : {},
    required: Array.isArray(parameters.required) ? parameters.required : []
  };
}

function normalizeToolResponse(output, startMs) {
  const duration = Date.now() - startMs;
  if (output && typeof output === "object" && "success" in output) {
    const error = output.error && typeof output.error === "object"
      ? output.error
      : (output.error ? String(output.error) : null);
    return {
      success: Boolean(output.success),
      result: output.result ?? null,
      error,
      evidence: Array.isArray(output.evidence) ? output.evidence : [],
      duration
    };
  }
  return {
    success: true,
    result: output ?? null,
    error: null,
    evidence: [],
    duration
  };
}

function safeSnapshot(value) {
  try {
    const json = JSON.stringify(value, (_key, item) => {
      if (typeof item === "string" && item.length > 2000) return `${item.slice(0, 2000)}...<truncated>`;
      return item;
    });
    if (!json) return value ?? null;
    return JSON.parse(json);
  } catch {
    return String(value);
  }
}

module.exports = { ToolRegistry };
