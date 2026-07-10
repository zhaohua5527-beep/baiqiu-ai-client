function createTool() {
  return {
    id: "list_skill_backups",
    name: "列出技能备份",
    description: "列出某个技能的所有备份版本。",
    parameters: {
      type: "object",
      required: ["skillName"],
      properties: {
        skillName: { type: "string", description: "技能名" }
      }
    },
    permission: { level: "skill.read", scope: "skills" },
    async execute(params, context) {
      return {
        success: true,
        result: context.skillManager.listBackups(params.skillName),
        error: null,
        evidence: [{ type: "skill", action: "list_backups", skillName: params.skillName }]
      };
    }
  };
}

module.exports = { createTool };
