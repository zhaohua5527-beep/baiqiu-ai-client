function createTool() {
  return {
    id: "modify_skill",
    name: "修改技能",
    description: "受控修改已安装技能文件。会备份、验证语法、更新 manifest、重新加载工具，失败会回滚。",
    parameters: {
      type: "object",
      required: ["skillName", "code", "reason"],
      properties: {
        skillName: { type: "string", description: "要修改的技能名" },
        code: { type: "string", description: "新的完整技能代码" },
        reason: { type: "string", description: "修改原因，用于审计日志" }
      }
    },
    permission: { level: "skill.write", scope: "skills" },
    async execute(params, context) {
      return context.skillManager.modifySkill(params.skillName, params.code, params.reason, context.auditLogger);
    }
  };
}

module.exports = { createTool };
