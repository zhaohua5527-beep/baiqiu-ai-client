function createImageGuardStrategy(input, services) {
  return {
    name: "image_guard_strategy",
    async canHandle() {
      return services.deps.shouldLocalReplyImageUnsupported(input.settings, input.attachments);
    },
    async execute() {
      return services.executeImageGuard(input);
    }
  };
}

module.exports = { createImageGuardStrategy };
