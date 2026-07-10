function createLocalAgentStrategy(input, services) {
  return {
    name: "local_agent_strategy",
    async canHandle() {
      return services.canUseLocalRouting(input);
    },
    async execute() {
      return services.executeLocalAgent(input);
    }
  };
}

module.exports = { createLocalAgentStrategy };
