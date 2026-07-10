const { PermissionPolicy } = require("../permission/permission-policy");

class RiskAnalyzer {
  constructor({ permissionPolicy = null } = {}) {
    this.permissionPolicy = permissionPolicy || new PermissionPolicy();
  }

  analyze(task = {}) {
    return this.permissionPolicy.classify({
      toolId: task.toolId || "",
      action: task.action || "",
      target: task.target || ""
    });
  }
}

module.exports = { RiskAnalyzer };
