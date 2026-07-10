function createSkillShortcutStrategy(input, services) {
  return {
    name: "skill_shortcut_strategy",
    async canHandle() {
      return services.canUseLocalRouting(input);
    },
    async execute() {
      return services.executeSkillShortcut(input);
    }
  };
}

module.exports = { createSkillShortcutStrategy };
