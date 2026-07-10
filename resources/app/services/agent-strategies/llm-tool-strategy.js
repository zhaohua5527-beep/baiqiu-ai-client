function createLlmToolStrategy(input, services) {
  return {
    name: "llm_tool_strategy",
    async execute() {
      return services.executeLlmTool(input);
    }
  };
}

module.exports = { createLlmToolStrategy };
