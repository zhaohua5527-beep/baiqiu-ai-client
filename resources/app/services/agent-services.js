class AgentServices {
  constructor(deps = {}) {
    this.deps = deps;
  }

  finalText(prefix, text) {
    return [prefix, text].filter(Boolean).join("\n\n");
  }

  sendSessionChanged() {
    this.deps.sendSessionChanged?.();
  }

  canUseLocalRouting(input) {
    return !input.skipLocalToolRouting;
  }

  canUseOpenClaw(input) {
    return input.settings?.defaultProvider === "openclaw";
  }

  async executeImageGuard(input) {
    const { session, attachments, settings, personaPrefix } = input;
    const { appendMessage, updateSession, recordAgentState, imageUnsupportedReply } = this.deps;
    const finalText = this.finalText(personaPrefix, imageUnsupportedReply(settings, attachments));
    appendMessage(session.id, { role: "assistant", text: finalText, raw: { localImageUnsupported: true, agentController: true } });
    updateSession(session.id, { status: "done" });
    recordAgentState(session.id, "completed", { intent: "image.unsupported", logicalTool: "local_guard" });
    this.sendSessionChanged();
    return {
      success: true,
      status: "success",
      message: finalText,
      clientResponse: { ok: true, sessionId: session.id, imageUnsupported: true, agentController: true }
    };
  }

  async executeLocalAgent(input) {
    const { session, effectiveText, attachments, personaPrefix, controller, runtimeContext, traceId } = input;
    const { appendMessage, updateSession, recordAgentState, detectIntent, runAgentOsTask } = this.deps;
    recordAgentState(session.id, "intent_detected", { intent: detectIntent(effectiveText), logicalTool: "agent_os", currentAgent: "supervisor", goal: effectiveText });
    const agentTask = await runAgentOsTask(effectiveText, { sessionId: session.id, provider: "agent-os", attachments, signal: controller.signal, runtimeContext, traceId });
    if (!agentTask?.handled) return { handled: false };
    const finalText = this.finalText(personaPrefix, agentTask.text);
    appendMessage(session.id, {
      role: "assistant",
      text: finalText,
      raw: {
        agentController: true,
        agentOs: true,
        intent: agentTask.intent,
        logicalTool: agentTask.logicalTool,
        toolId: agentTask.toolId,
        plan: agentTask.plan,
        result: agentTask.normalized
      }
    });
    updateSession(session.id, { status: agentTask.normalized.success ? "done" : "failed" });
    this.sendSessionChanged();
    return {
      success: Boolean(agentTask.normalized.success),
      status: agentTask.normalized.success ? "success" : "failed",
      message: finalText,
      tasks: agentTask.plan || [],
      toolResults: agentTask.response ? [agentTask.response] : [],
      verification: agentTask.normalized || null,
      clientResponse: { ok: agentTask.normalized.success, agentOs: true, sessionId: session.id, intent: agentTask.intent, tool: agentTask.logicalTool, agentController: true }
    };
  }

  async executeDirectCommand(input) {
    const { session, effectiveText, personaPrefix, controller, traceId } = input;
    const { appendMessage, updateSession, recordAgentState, detectIntent, tryHandleDirectToolCommand } = this.deps;
    recordAgentState(session.id, "tool_selected", { intent: detectIntent(effectiveText), logicalTool: "direct_command", currentAgent: "tool_selector", goal: effectiveText });
    recordAgentState(session.id, "executing", { intent: detectIntent(effectiveText), logicalTool: "direct_command", currentAgent: "executor", goal: effectiveText });
    const directToolText = await tryHandleDirectToolCommand(effectiveText, { sessionId: session.id, provider: "direct-command", signal: controller.signal, traceId });
    if (!directToolText) return { handled: false };
    const finalText = this.finalText(personaPrefix, directToolText);
    appendMessage(session.id, { role: "assistant", text: finalText, raw: { directTool: true, agentController: true } });
    updateSession(session.id, { status: "done" });
    recordAgentState(session.id, "completed", { intent: detectIntent(effectiveText), logicalTool: "direct_command" });
    this.sendSessionChanged();
    return {
      success: true,
      status: "success",
      message: finalText,
      clientResponse: { ok: true, direct: true, sessionId: session.id, directTool: true, agentController: true }
    };
  }

  async executeSkillShortcut(input) {
    const { session, effectiveText, personaPrefix } = input;
    const { appendMessage, updateSession, recordAgentState, detectIntent, tryHandleSkillShortcut } = this.deps;
    recordAgentState(session.id, "tool_selected", { intent: detectIntent(effectiveText), logicalTool: "skill_shortcut", currentAgent: "tool_selector", goal: effectiveText });
    recordAgentState(session.id, "executing", { intent: detectIntent(effectiveText), logicalTool: "skill_shortcut", currentAgent: "executor", goal: effectiveText });
    const skillShortcutText = await tryHandleSkillShortcut(effectiveText);
    if (!skillShortcutText) return { handled: false };
    const finalText = this.finalText(personaPrefix, skillShortcutText);
    appendMessage(session.id, { role: "assistant", text: finalText, raw: { skillShortcut: true, agentController: true } });
    updateSession(session.id, { status: "done" });
    recordAgentState(session.id, "completed", { intent: detectIntent(effectiveText), logicalTool: "skill_shortcut" });
    this.sendSessionChanged();
    return {
      success: true,
      status: "success",
      message: finalText,
      clientResponse: { ok: true, direct: true, sessionId: session.id, skillShortcut: true, agentController: true }
    };
  }

  async executeRealtimeWeb(input) {
    const { session, effectiveText, personaPrefix, controller, traceId } = input;
    const { appendMessage, updateSession, recordAgentState, tryHandleRealtimeWebQuestion } = this.deps;
    recordAgentState(session.id, "tool_selected", { intent: "realtime.web", logicalTool: "web_search", currentAgent: "tool_selector", goal: effectiveText });
    recordAgentState(session.id, "executing", { intent: "realtime.web", logicalTool: "web_search", currentAgent: "executor", goal: effectiveText });
    const realtimeText = await tryHandleRealtimeWebQuestion(effectiveText, { sessionId: session.id, provider: "realtime-web", signal: controller.signal, traceId });
    if (!realtimeText) return { handled: false };
    const finalText = this.finalText(personaPrefix, realtimeText);
    appendMessage(session.id, { role: "assistant", text: finalText, raw: { realtimeWeb: true, agentController: true } });
    updateSession(session.id, { status: "done" });
    recordAgentState(session.id, "completed", { intent: "realtime.web", logicalTool: "web_search" });
    this.sendSessionChanged();
    return {
      success: true,
      status: "success",
      message: finalText,
      clientResponse: { ok: true, direct: true, sessionId: session.id, realtimeWeb: true, agentController: true }
    };
  }

  async executeOpenClaw(input) {
    const { session, payload, effectiveText, attachments, settings, personaPrefix, controller, traceId } = input;
    const { loadDb, recordAgentState, detectIntent, sendWithOpenClaw } = this.deps;
    const modelSession = loadDb().sessions.find((item) => item.id === session.id) || session;
    recordAgentState(session.id, "intent_detected", { intent: detectIntent(effectiveText), logicalTool: "openclaw_agent_loop", currentAgent: "supervisor", goal: effectiveText });
    recordAgentState(session.id, "executing", { intent: detectIntent(effectiveText), logicalTool: "openclaw_agent_loop", currentAgent: "executor", goal: effectiveText });
    const result = await sendWithOpenClaw(modelSession, { ...payload, text: effectiveText }, attachments, settings, personaPrefix, { signal: controller.signal, traceId });
    const ok = result?.status === "done" || result?.status === "success";
    recordAgentState(session.id, ok ? "completed" : "failed", { intent: detectIntent(effectiveText), logicalTool: "openclaw_agent_loop" });
    return {
      success: ok,
      status: ok ? "success" : "failed",
      message: result?.text || "",
      raw: result,
      clientResponse: { ok: true, sessionId: session.id, ...result, agentController: true }
    };
  }

  async executeLlmTool(input) {
    const { session, originalText, effectiveText, attachments, settings, personaPrefix, controller, traceId } = input;
    const { appendMessage, updateSession, recordAgentState, detectIntent, directProviderChat, applyBaiqiuActions, onPersonaPrefix } = this.deps;
    recordAgentState(session.id, "intent_detected", { intent: detectIntent(effectiveText), logicalTool: "llm_agent_loop", currentAgent: "supervisor", goal: effectiveText });
    recordAgentState(session.id, "executing", { intent: detectIntent(effectiveText), logicalTool: "llm_agent_loop", currentAgent: "executor", goal: effectiveText });
    const direct = await directProviderChat(settings, effectiveText, attachments, session.id, { signal: controller.signal });
    recordAgentState(session.id, "validating", { intent: detectIntent(effectiveText), logicalTool: "llm_agent_loop", currentAgent: "verifier" });
    const actioned = await applyBaiqiuActions(direct.text, { originalUserMessage: originalText, traceId });
    const finalText = this.finalText(personaPrefix, actioned.text);
    if (personaPrefix) onPersonaPrefix?.();
    appendMessage(session.id, { role: "assistant", text: finalText, raw: { ...direct.raw, baiqiuActions: actioned.results, agentController: true } });
    updateSession(session.id, { status: "done" });
    recordAgentState(session.id, "completed", { intent: detectIntent(effectiveText), logicalTool: "llm_agent_loop" });
    this.sendSessionChanged();
    return {
      success: true,
      status: "success",
      message: finalText,
      toolResults: actioned.results || [],
      raw: direct.raw,
      clientResponse: { ok: true, direct: true, sessionId: session.id, agentController: true }
    };
  }
}

module.exports = { AgentServices };
