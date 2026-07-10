function createOpenClawStrategy(input, services) {
  return {
    name: "openclaw_strategy",
    async canHandle() {
      return services.canUseOpenClaw(input);
    },
    async execute() {
      return services.executeOpenClaw(input);
    }
  };
}

module.exports = { createOpenClawStrategy };
