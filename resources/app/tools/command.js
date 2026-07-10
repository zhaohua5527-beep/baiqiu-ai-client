function commandTool(id, name) {
  return {
    id,
    name,
    description: "执行经过白球安全策略检查的本地命令。",
    parameters: {
      type: "object",
      required: ["command"],
      properties: {
        command: { type: "string" },
        cwd: { type: "string" }
      }
    },
    permission: { level: "process.execute", scope: "safe-command" },
    async execute(params, context) {
      const result = await context.runtime.executeRunCommand(params);
      return {
        success: result && typeof result === "object" && "success" in result ? Boolean(result.success) : true,
        result,
        error: result && typeof result === "object" && result.success === false ? (result.message || "命令执行失败") : null,
        evidence: [{ type: "command-output", tool: id }]
      };
    }
  };
}

function createTools() {
  return [
    commandTool("run_command", "运行安全命令"),
    commandTool("execute_command", "运行安全命令（兼容别名）"),
    commandTool("shell_command", "运行安全命令（兼容别名）")
  ];
}

module.exports = { createTools };
