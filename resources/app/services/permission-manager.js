const CONFIRM_TOOL_IDS = new Set([
  "run_command",
  "execute_command",
  "shell_command",
  "modify_app_file",
  "recycle_desktop_files",
  "organize_desktop_files",
  "delete_memory",
  "remove_skill",
  "modify_skill",
  "rollback_skill",
  "system_shutdown"
]);

class PermissionManager {
  constructor(options = {}) {
    this.mainWindow = options.mainWindow || null;
    this.ownerDevice = options.ownerDevice || false;
    this.advancedMode = options.advancedMode || false;
    this.isUnlocked = options.isUnlocked || false;
    this.accessMode = options.accessMode || "full";
    this.permissionModes = options.permissionModes || {};
    this.trustedTools = new Set(options.trustedTools || []);
    this.saveTrustedTools = typeof options.saveTrustedTools === "function" ? options.saveTrustedTools : null;
    this.savePermissionMode = typeof options.savePermissionMode === "function" ? options.savePermissionMode : null;
  }

  check(tool, _context) {
    const required = tool.permission || "read";
    const scope = this.scopeFor(tool);
    const mode = this.modeFor(tool);
    let current = "read";
    let allowed = true;
    let message = "";

    if (this.accessMode === "normal" && CONFIRM_TOOL_IDS.has(tool.id)) {
      return {
        allowed: false,
        required,
        current: "normal",
        trusted: false,
        scope,
        mode,
        message: "当前为普通模式，不执行需要系统权限的工具。请在输入框右侧切换为请求或完全模式。"
      };
    }

    if (mode === "deny") {
      return {
        allowed: false,
        required,
        current: "denied",
        trusted: false,
        scope,
        mode,
        message: `此操作所属权限「${scope}」已被设置为拒绝，请切换权限模式后重试。`
      };
    }

    if (required === "admin") {
      current = this.advancedMode ? "admin" : "read";
      allowed = current === "admin";
      if (!allowed) message = "此操作需要管理员权限，请在输入框右侧选择完全访问。";
    } else if (required === "write") {
      current = this.isUnlocked ? "write" : "read";
      allowed = current === "write";
      if (!allowed) message = "白球 AI 尚未激活，无法执行写入操作。";
    } else {
      current = this.isUnlocked ? "read" : "none";
      allowed = this.isUnlocked;
      if (!allowed) message = "白球 AI 尚未激活，无法执行此操作。";
    }

    return {
      allowed,
      required,
      current,
      trusted: this.isTrusted(tool.id),
      scope,
      mode,
      message: allowed ? "" : message
    };
  }

  requiresConfirmation(tool) {
    if (!tool?.id) return false;
    if (this.accessMode === "full") return false;
    if (this.accessMode === "normal") return false;
    if (this.isTrusted(tool.id)) return false;
    const mode = this.modeFor(tool);
    if (mode === "allow_always" || mode === "allow_once") return false;
    if (mode === "deny") return false;
    return CONFIRM_TOOL_IDS.has(tool.id);
  }

  trustTool(toolId) {
    const id = String(toolId || "").trim();
    if (!id) return false;
    this.trustedTools.add(id);
    this._persistTrustedTools();
    return true;
  }

  revokeTrust(toolId) {
    const id = String(toolId || "").trim();
    if (!id) return false;
    const removed = this.trustedTools.delete(id);
    if (removed) this._persistTrustedTools();
    return removed;
  }

  isTrusted(toolId) {
    return this.trustedTools.has(String(toolId || "").trim());
  }

  scopeFor(tool) {
    const raw = String(tool?.permissionScope || tool?.permission?.scope || tool?.scope || "").toLowerCase();
    const id = String(tool?.id || "").toLowerCase();
    const level = String(tool?.permission || tool?.permission?.level || "").toLowerCase();
    if (raw.includes("network") || id.includes("web") || id.includes("search")) return "network";
    if (raw.includes("file") || raw.includes("desktop") || raw.includes("filesystem") || level.includes("write") || level.includes("move") || level.includes("recycle")) return "file";
    if (level.includes("admin") || level.includes("execute") || id.includes("command") || id.includes("shell")) return "system";
    return "tool";
  }

  modeFor(tool) {
    const scope = this.scopeFor(tool);
    const toolMode = this.permissionModes?.[tool.id]?.mode;
    const scopeMode = this.permissionModes?.[scope]?.mode;
    return toolMode || scopeMode || "ask";
  }

  rememberMode(scope, mode) {
    const normalizedScope = String(scope || "tool").trim() || "tool";
    const normalizedMode = ["ask", "allow_once", "allow_always", "deny"].includes(mode) ? mode : "ask";
    this.permissionModes = {
      ...(this.permissionModes || {}),
      [normalizedScope]: { mode: normalizedMode, scope: normalizedScope }
    };
    if (this.savePermissionMode) this.savePermissionMode(normalizedScope, normalizedMode);
  }

  async requestConfirmation(tool, params, context) {
    if (!this.requiresConfirmation(tool)) {
      return { confirmed: true, remembered: this.isTrusted(tool.id) };
    }
    return { confirmed: false, pending: true, tool, params, context };
  }

  _buildConfirmDetail(tool, params) {
    const lines = [];
    lines.push(`工具ID: ${tool.id}`);
    lines.push(`权限级别: ${tool.permission || "read"}`);
    const safeParams = { ...(params || {}) };
    const sensitive = ["password", "token", "apiKey", "secret", "key", "content"];
    for (const key of sensitive) {
      if (safeParams[key] !== undefined && typeof safeParams[key] === "string") {
        safeParams[key] = "***";
      }
    }
    lines.push(`参数: ${JSON.stringify(safeParams, null, 2)}`);
    return lines.join("\n");
  }

  _persistTrustedTools() {
    if (this.saveTrustedTools) this.saveTrustedTools([...this.trustedTools]);
  }

  updateState(options = {}) {
    if (options.ownerDevice !== undefined) this.ownerDevice = options.ownerDevice;
    if (options.advancedMode !== undefined) this.advancedMode = options.advancedMode;
    if (options.isUnlocked !== undefined) this.isUnlocked = options.isUnlocked;
    if (options.mainWindow !== undefined) this.mainWindow = options.mainWindow;
    if (options.accessMode !== undefined) this.accessMode = options.accessMode || "full";
    if (options.permissionModes !== undefined) this.permissionModes = options.permissionModes || {};
    if (options.trustedTools !== undefined) this.trustedTools = new Set(options.trustedTools || []);
    if (typeof options.saveTrustedTools === "function") this.saveTrustedTools = options.saveTrustedTools;
    if (typeof options.savePermissionMode === "function") this.savePermissionMode = options.savePermissionMode;
  }
}

module.exports = PermissionManager;
