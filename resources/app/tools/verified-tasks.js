function createVerifiedTaskTool({ id, name, description, parameters, category, supportedIntent, riskLevel = "medium", run, evidenceType }) {
  return {
    id,
    name,
    description,
    category,
    supportedIntent,
    riskLevel,
    requirePermission: riskLevel !== "low",
    parameters,
    permission: { level: "filesystem.write", scope: "app.desktop.saveLocation" },
    async execute(params, context) {
      if (!context?.runtime || typeof run !== "function") {
        throw new Error(`Tool runtime is not available: ${id}`);
      }
      const result = await run(params || {}, context);
      return {
        success: Boolean(result?.success),
        result,
        error: result?.success ? null : (result?.error || "工具执行失败"),
        evidence: [
          { type: evidenceType, tool: id },
          ...(Array.isArray(result?.evidence) ? result.evidence : [])
        ]
      };
    }
  };
}

function createTools() {
  return [
    createVerifiedTaskTool({
      id: "calculator_creator",
      name: "创建白球计算器",
      description: "生成可运行的 HTML 计算器，验证文件和功能后用真实浏览器打开。",
      category: "dev",
      supportedIntent: ["dev.code.calculator"],
      riskLevel: "medium",
      evidenceType: "html-app",
      parameters: {
        type: "object",
        properties: {
          message: { type: "string" }
        }
      },
      run: (params, context) => context.runtime.executeCalculatorCreator(params, context)
    }),
    createVerifiedTaskTool({
      id: "html_app_creator",
      name: "创建 HTML 应用",
      description: "根据用户需求生成本地 HTML 应用，验证后用真实浏览器打开。",
      category: "dev",
      supportedIntent: ["dev.code"],
      riskLevel: "medium",
      evidenceType: "html-app",
      parameters: {
        type: "object",
        properties: {
          message: { type: "string" }
        }
      },
      run: (params, context) => context.runtime.executeHtmlAppCreator(params, context)
    }),
    createVerifiedTaskTool({
      id: "file_creator",
      name: "创建真实文件",
      description: "根据用户请求创建真实文件并验证文件存在和大小。",
      category: "file",
      supportedIntent: ["file.create"],
      riskLevel: "medium",
      evidenceType: "file",
      parameters: {
        type: "object",
        properties: {
          message: { type: "string" }
        }
      },
      run: (params, context) => context.runtime.executeFileCreator(params, context)
    }),
    {
      id: "browser_open",
      name: "浏览器打开",
      description: "使用真实浏览器打开 HTML 文件或网页，避免 WPS/Office 接管 HTML。",
      category: "system",
      supportedIntent: ["system.open", "file.open", "dev.code", "dev.code.calculator"],
      riskLevel: "low",
      requirePermission: false,
      parameters: {
        type: "object",
        required: ["path"],
        properties: {
          path: { type: "string" },
          url: { type: "string" },
          target: { type: "string" }
        }
      },
      permission: { level: "filesystem.read", scope: "app.desktop.saveLocation" },
      async execute(params, context) {
        const result = await context.runtime.executeBrowserOpen(params, context);
        return {
          success: true,
          result,
          error: null,
          evidence: [{ type: "browser-open", tool: "browser_open" }]
        };
      }
    }
  ];
}

module.exports = { createTools };
