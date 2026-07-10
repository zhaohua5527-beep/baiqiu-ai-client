const { AgentIdentityCenter } = require("../identity/agent-identity-center");
const { ReflectionMemory } = require("../reflection/reflection-memory");

class ContextInterpreter {
  constructor({ identityCenter = null, reflectionMemory = null } = {}) {
    this.identityCenter = identityCenter || new AgentIdentityCenter();
    this.reflectionMemory = reflectionMemory || new ReflectionMemory();
  }

  interpret({ input = "", agentId = "default-agent", taskType = "", conversation = [] } = {}) {
    const identity = this.identityCenter.getIdentity(agentId);
    const reflectionHints = this.reflectionMemory.getHints({ taskType });
    const signals = this.extractSignals(input);
    const recentConversation = Array.isArray(conversation) ? conversation.slice(-5) : [];
    return {
      agentId,
      identityKnown: Boolean(identity),
      agentRole: identity?.profile?.role || "",
      signals,
      reflectionHints,
      recentConversation,
      safety: {
        analysisOnly: true,
        executesTool: false,
        bypassesToolSelector: false,
        bypassesVerifierCenter: false
      }
    };
  }

  extractSignals(input = "") {
    const text = String(input || "");
    const signals = [];
    if (/然后|并且|再|接着/.test(text)) signals.push("multi_step");
    if (/三个|3个|三份|多个/.test(text)) signals.push("quantity");
    if (/里面|放入|保存到|其中/.test(text)) signals.push("spatial_relation");
    if (/打开|启动|运行/.test(text)) signals.push("open_after_create");
    if (/记住|我的.*叫|项目叫/.test(text)) signals.push("memory_fact");
    if (/关闭电脑|删除|安装/.test(text)) signals.push("high_risk_possible");
    if (/什么|为什么|解释|告诉我/.test(text)) signals.push("chat_or_question");
    return signals;
  }
}

module.exports = { ContextInterpreter };
