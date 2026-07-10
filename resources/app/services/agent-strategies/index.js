const { AgentServices } = require("../agent-services");
const { createImageGuardStrategy } = require("./image-guard-strategy");
const { createLocalAgentStrategy } = require("./local-agent-strategy");
const { createDirectCommandStrategy } = require("./direct-command-strategy");
const { createSkillShortcutStrategy } = require("./skill-shortcut-strategy");
const { createRealtimeWebStrategy } = require("./realtime-web-strategy");
const { createOpenClawStrategy } = require("./openclaw-strategy");
const { createLlmToolStrategy } = require("./llm-tool-strategy");

function buildChatAgentStrategies(input, deps) {
  const services = deps instanceof AgentServices ? deps : new AgentServices(deps);
  return [
    createImageGuardStrategy(input, services),
    createLocalAgentStrategy(input, services),
    createDirectCommandStrategy(input, services),
    createSkillShortcutStrategy(input, services),
    createRealtimeWebStrategy(input, services),
    createOpenClawStrategy(input, services),
    createLlmToolStrategy(input, services)
  ];
}

module.exports = { buildChatAgentStrategies };
