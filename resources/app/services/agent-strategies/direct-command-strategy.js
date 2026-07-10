function createDirectCommandStrategy(input, services) {
  return {
    name: "direct_command_strategy",
    async canHandle() {
      return services.canUseLocalRouting(input);
    },
    async execute() {
      return services.executeDirectCommand(input);
    }
  };
}

module.exports = { createDirectCommandStrategy };
