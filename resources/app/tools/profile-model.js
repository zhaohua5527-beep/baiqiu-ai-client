function createTools() {
  return [
    {
      id: "update_profile",
      name: "更新人格资料",
      description: "当用户要求修改称呼、AI名字、性格、回复风格或做事风格时调用。",
      parameters: {
        type: "object",
        properties: {
          userAddress: { type: "string", description: "用户希望被怎样称呼，例如：张三、BOSS" },
          assistantName: { type: "string", description: "AI助手的新名字，例如：小白" },
          personality: { type: "string", description: "新的性格设定" },
          replyStyle: { type: "string", description: "新的回复风格" },
          workStyle: { type: "string", description: "新的做事风格" }
        },
        required: []
      },
      permission: { level: "profile.write", scope: "user" },
      async execute(params, context) {
        const result = context.runtime.updateProfile(params || {});
        return { success: true, result, error: null, evidence: [{ type: "profile", action: "update", fields: Object.keys(params || {}) }] };
      }
    },
    {
      id: "get_profile",
      name: "读取人格资料",
      description: "读取当前用户称呼、AI名字、性格、回复风格和做事风格。",
      parameters: { type: "object", properties: {}, required: [] },
      permission: { level: "profile.read", scope: "user" },
      async execute(_params, context) {
        return { success: true, result: context.runtime.getProfile(), error: null, evidence: [{ type: "profile", action: "read" }] };
      }
    },
    {
      id: "switch_model",
      name: "切换模型",
      description: "根据用户要求切换当前默认模型供应商。",
      parameters: {
        type: "object",
        properties: {
          provider: { type: "string", description: "模型供应商 id，例如 deepseek、openai、kimi、openclaw" }
        },
        required: ["provider"]
      },
      permission: { level: "settings.write", scope: "model" },
      async execute(params, context) {
        const result = context.runtime.switchModel(params.provider);
        return { success: true, result, error: null, evidence: [{ type: "model", action: "switch", provider: params.provider }] };
      }
    },
    {
      id: "list_models",
      name: "列出模型",
      description: "列出白球 AI 当前可用的模型供应商与默认模型。",
      parameters: { type: "object", properties: {}, required: [] },
      permission: { level: "settings.read", scope: "model" },
      async execute(_params, context) {
        return { success: true, result: context.runtime.listModels(), error: null, evidence: [{ type: "model", action: "list" }] };
      }
    },
    {
      id: "switch_reasoning",
      name: "切换推理等级",
      description: "根据用户要求切换推理等级，例如 minimal、low、medium、high、maximum。",
      parameters: {
        type: "object",
        properties: {
          reasoning: { type: "string", description: "推理等级：off、minimal、low、medium、high、extra_high、maximum" }
        },
        required: ["reasoning"]
      },
      permission: { level: "settings.write", scope: "model" },
      async execute(params, context) {
        const result = context.runtime.switchReasoning(params.reasoning);
        return { success: true, result, error: null, evidence: [{ type: "model", action: "switch_reasoning", reasoning: params.reasoning }] };
      }
    }
  ];
}

module.exports = { createTools };


