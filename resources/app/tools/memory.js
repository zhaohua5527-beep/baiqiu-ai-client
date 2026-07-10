function createTools() {
  return [
    {
      id: "read_memory",
      name: "读取长期记忆",
      description: "读取当前用户的所有长期记忆。",
      parameters: {
        type: "object",
        properties: {}
      },
      permission: { level: "memory.read", scope: "user" },
      async execute(_params, context) {
        const result = context.memory.manager.getAll();
        return {
          success: true,
          result,
          error: null,
          evidence: [{ type: "memory", tool: "read_memory" }]
        };
      }
    },
    {
      id: "write_memory",
      name: "写入长期记忆",
      description: "写入一条长期记忆。",
      parameters: {
        type: "object",
        required: ["key", "value"],
        properties: {
          key: { type: "string", description: "记忆键，例如：最喜欢的颜色" },
          value: { type: "string", description: "记忆值，例如：蓝色" }
        }
      },
      permission: { level: "memory.write", scope: "user" },
      async execute(params, context) {
        context.memory.manager.set(params.key, params.value);
        return {
          success: true,
          result: "好的，记住了。",
          error: null,
          evidence: [{ type: "memory", tool: "write_memory", key: params.key }]
        };
      }
    },
    {
      id: "delete_memory",
      name: "删除长期记忆",
      description: "删除一条长期记忆。",
      parameters: {
        type: "object",
        required: ["key"],
        properties: {
          key: { type: "string", description: "要删除的记忆键" }
        }
      },
      permission: { level: "memory.write", scope: "user" },
      async execute(params, context) {
        const result = context.memory.manager.delete(params.key);
        return {
          success: true,
          result,
          error: null,
          evidence: [{ type: "memory", tool: "delete_memory", key: params.key }]
        };
      }
    }
  ];
}

module.exports = { createTools };
