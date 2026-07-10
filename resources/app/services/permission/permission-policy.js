const HIGH_RISK_TOOLS = new Set([
  "system_shutdown",
  "delete_file",
  "remove_file",
  "recycle_desktop_files",
  "install_program",
  "run_command",
  "execute_command",
  "shell_command"
]);

const MEDIUM_RISK_TOOLS = new Set([
  "file_creator",
  "write_text_file",
  "calculator_creator",
  "html_app_creator",
  "skill_install",
  "modify_app_file"
]);

const LOW_RISK_TOOLS = new Set([
  "create_folder",
  "browser_open",
  "open_path",
  "find_desktop_files",
  "list_skills"
]);

class PermissionPolicy {
  classify({ toolId = "", action = "", target = "" } = {}) {
    const id = String(toolId || "").trim();
    const key = `${id} ${action} ${target}`.toLowerCase();
    if (HIGH_RISK_TOOLS.has(id) || /shutdown|delete|remove|install_program|power/.test(key)) {
      return {
        riskLevel: "high",
        requiresPermission: true,
        needUserConfirm: true,
        permissionScope: "system"
      };
    }
    if (MEDIUM_RISK_TOOLS.has(id) || /write|modify|skill_install/.test(key)) {
      return {
        riskLevel: "medium",
        requiresPermission: true,
        needUserConfirm: false,
        permissionScope: id === "skill_install" ? "skills" : "file"
      };
    }
    if (LOW_RISK_TOOLS.has(id) || /create_folder|open|query|list/.test(key)) {
      return {
        riskLevel: "low",
        requiresPermission: false,
        needUserConfirm: false,
        permissionScope: "tool"
      };
    }
    return {
      riskLevel: "low",
      requiresPermission: false,
      needUserConfirm: false,
      permissionScope: "tool"
    };
  }
}

module.exports = { PermissionPolicy };
