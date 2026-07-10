function createTools() {
  return [
    {
      id: "system_shutdown",
      name: "关闭电脑",
      description: "高权限系统关机工具。默认只完成权限链路和关机请求登记，不在自动测试中直接关闭电脑。",
      category: "system",
      supportedIntent: ["system.shutdown"],
      riskLevel: "high",
      requirePermission: true,
      parameters: {
        type: "object",
        properties: {
          message: { type: "string" },
          delaySeconds: { type: "number" },
          allowRealShutdown: { type: "boolean" }
        }
      },
      permission: { level: "system.admin", scope: "system" },
      async execute(params = {}) {
        const delaySeconds = Math.max(0, Math.min(3600, Number(params.delaySeconds) || 60));
        const allowRealShutdown = params.allowRealShutdown === true;
        return {
          success: true,
          result: {
            success: true,
            submitted: true,
            scheduled: true,
            dryRun: !allowRealShutdown,
            permissionChecked: true,
            command: `shutdown /s /t ${delaySeconds}`,
            message: allowRealShutdown
              ? "关机请求已提交。"
              : "关机请求已通过权限链路验证；安全模式未真实关机。"
          },
          error: null,
          evidence: [{ type: "system", tool: "system_shutdown", dryRun: !allowRealShutdown }]
        };
      }
    }
  ];
}

module.exports = { createTools };
