function createTool() {
  return {
    id: "optimize_skill",
    name: "准备优化技能",
    description: "读取当前技能代码和优化目标，供 AI 生成改进后的完整代码，再调用 modify_skill 完成更新。",
    parameters: {
      type: "object",
      required: ["skillName", "optimizationGoal"],
      properties: {
        skillName: { type: "string", description: "要优化的技能名" },
        optimizationGoal: { type: "string", description: "优化目标，如提高性能、修复 bug、增加错误处理" }
      }
    },
    permission: { level: "skill.read", scope: "skills" },
    async execute(params, context) {
      return context.skillManager.prepareSkillOptimization(params.skillName, params.optimizationGoal);
    }
  };
}

module.exports = { createTool };
