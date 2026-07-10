function createAgentContext(input = {}) {
  return {
    requestId: input.requestId || `agent-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    userMessage: String(input.userMessage || ""),
    conversationId: input.conversationId || "",
    model: input.model || "",
    provider: input.provider || "",
    tasks: Array.isArray(input.tasks) ? input.tasks : [],
    currentStep: input.currentStep || "created",
    toolCalls: Array.isArray(input.toolCalls) ? input.toolCalls : [],
    results: Array.isArray(input.results) ? input.results : [],
    createdAt: input.createdAt || Date.now(),
    ...input
  };
}

module.exports = { createAgentContext };
