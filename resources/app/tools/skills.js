function createTools() {
  return [
    {
      id: "install_skill",
      name: "安装技能",
      description: "安装一个新的白球本地技能。技能代码必须包含 MANIFEST 对象和 execute 异步函数。",
      parameters: {
        type: "object",
        required: ["skillName", "skillCode"],
        properties: {
          skillName: { type: "string", description: "技能文件名，不含扩展名，例如 get_desktop_file_count" },
          skillCode: { type: "string", description: "完整 JavaScript 技能代码" }
        }
      },
      permission: { level: "skill.write", scope: "skills" },
      async execute(params, context) {
        const result = await context.skillManager.installSkill(params.skillName, params.skillCode);
        return result;
      }
    },
    {
      id: "list_skills",
      name: "列出技能",
      description: "列出当前已启用的白球本地技能。",
      parameters: {
        type: "object",
        properties: {}
      },
      permission: { level: "skill.read", scope: "skills" },
      async execute(_params, context) {
        const installed = context.skillCenter?.listSkills?.() || [];
        return {
          success: true,
          result: installed.length ? installed : context.skillManager.listSkills(),
          error: null,
          evidence: [{ type: "skills", tool: "list_skills" }]
        };
      }
    },
    {
      id: "skill_install",
      name: "学习并安装技能",
      description: "通过 SkillCenter 学习技能，缺少真实外部能力时返回失败，禁止假装安装成功。",
      category: "skill",
      supportedIntent: ["skill.learn"],
      riskLevel: "medium",
      requirePermission: true,
      parameters: {
        type: "object",
        properties: {
          message: { type: "string" },
          name: { type: "string" },
          target: { type: "string" }
        }
      },
      permission: { level: "skill.write", scope: "skills" },
      async execute(params, context) {
        const message = params.message || params.name || params.target || "";
        const target = String(params.target || params.name || message || "");
        if (/(\u5929\u6c14|\u6c14\u6e29|\u4e0b\u96e8|\u9884\u62a5|\u6f6e\u2569\u6c49|weather)/i.test(target) || /weather/i.test(target)) {
          const result = context.skillCenter?.learnSkillFromRequest?.(message) || {
            success: false,
            status: "failed",
            skill: { id: "weather", name: "全国天气查询", status: "failed" },
            error: "缺少真实天气查询工具或天气 API，不能安装天气查询技能。"
          };
          if (result.skill && result.skill.status === "installed") result.skill.status = "failed";
          return {
            success: false,
            result: {
              ...result,
              success: false,
              status: "failed",
              error: result.error || "缺少真实天气查询工具或天气 API，不能安装天气查询技能。",
              skillsJson: context.skillCenter?.paths?.().skillsJson || ""
            },
            error: result.error || "缺少真实天气查询工具或天气 API，不能安装天气查询技能。",
            evidence: [{ type: "skill", tool: "skill_install", blocked: true }]
          };
        }
        const result = context.skillCenter?.learnSkillFromRequest?.(message);
        if (!result) throw new Error("SkillCenter 不可用，无法安装技能。");
        return {
          success: Boolean(result.success),
          result: {
            ...result,
            skillsJson: context.skillCenter?.paths?.().skillsJson || ""
          },
          error: result.success ? null : (result.error || "技能安装失败。"),
          evidence: [{ type: "skill", tool: "skill_install" }]
        };
      }
    },
    {
      id: "remove_skill",
      name: "删除技能",
      description: "删除一个已安装的白球本地技能。",
      parameters: {
        type: "object",
        required: ["skillName"],
        properties: {
          skillName: { type: "string", description: "要删除的技能名，例如 get_current_time" }
        }
      },
      permission: { level: "skill.write", scope: "skills" },
      async execute(params, context) {
        return context.skillManager.removeSkill(params.skillName);
      }
    }
  ];
}

module.exports = { createTools };
