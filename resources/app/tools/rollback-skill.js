function createTool() {
  return {
    id: "rollback_skill",
    name: "回滚技能",
    description: "将技能回滚到备份版本。不指定 version 时回滚到最新备份。",
    parameters: {
      type: "object",
      required: ["skillName"],
      properties: {
        skillName: { type: "string", description: "要回滚的技能名" },
        version: { type: "string", description: "可选，备份版本号或备份文件名" }
      }
    },
    permission: { level: "skill.write", scope: "skills" },
    async execute(params, context) {
      return context.skillManager.rollbackSkill(params.skillName, params.version, context.auditLogger);
    }
  };
}

module.exports = { createTool };
