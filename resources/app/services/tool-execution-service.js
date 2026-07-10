class ToolExecutionService {
  constructor({ registry, selector, verifier = null, withTimeout, ensureRunActive, formatText, logger = null, tracer = null } = {}) {
    this.registry = registry;
    this.selector = selector;
    this.verifier = verifier;
    this.withTimeout = withTimeout || ((promise) => Promise.resolve(promise));
    this.ensureRunActive = ensureRunActive || (() => {});
    this.formatText = formatText || ((response) => String(response?.result ?? response?.error ?? ""));
    this.logger = typeof logger === "function" ? logger : null;
    this.tracer = tracer;
  }

  async execute({ toolId, args = {}, context = {} } = {}) {
    const startedAt = Date.now();
    const id = String(toolId || "").trim();
    const signal = context.signal || null;
    let approval = { approved: false, reason: "tool execution not started", selectedTools: [] };
    try {
      this.ensureRunActive(signal);
      approval = this.selector.approveToolCall({
        toolId: id,
        params: args,
        intent: context.agentIntent || context.intent || "",
        context,
        availableTools: this.registry.list()
      });
    } catch (error) {
      return this.standardize({
        toolId: id,
        response: this.failureResponse(id, error, startedAt),
        startedAt,
        approval,
        traceId: context.traceId || ""
      });
    }
    this.trace("INFO", "[Execution]", {
      tool: id,
      input: this.safeArgs(args),
      approved: approval.approved,
      reason: approval.reason
    });
    this.tracer?.record?.(context.traceId, "ToolExecutionService", "tool_approve", approval.approved ? "approved" : "blocked", {
      toolId: id,
      args: this.safeArgs(args),
      reason: approval.reason
    });
    if (!approval.approved) {
      return this.standardize({
        toolId: id,
        response: {
          success: false,
          result: null,
          error: approval.reason,
          evidence: [{ type: "tool-selection", approved: false, tool: id, reason: approval.reason }],
          duration: Date.now() - startedAt
        },
        startedAt,
        approval,
        traceId: context.traceId || ""
      });
    }
    this.tracer?.record?.(context.traceId, "ToolExecutionService", "tool_execute", "running", {
      toolId: id,
      args: this.safeArgs(args)
    });
    try {
      const response = await this.withTimeout(
      this.registry.execute(id, args, { ...context, toolSelection: approval }),
      30000,
      `工具 ${id} 执行`
    );
      return this.standardize({ toolId: id, response, startedAt, approval, traceId: context.traceId || "" });
    } catch (error) {
      return this.standardize({
        toolId: id,
        response: this.failureResponse(id, error, startedAt),
        startedAt,
        approval,
        traceId: context.traceId || ""
      });
    }
  }

  async executeActions(actions = [], context = {}) {
    const results = [];
    for (const action of actions) {
      this.ensureRunActive(context.signal || null);
      const type = String(action?.type || action?.name || "").trim();
      const item = await this.execute({ toolId: type, args: action, context });
      results.push({
        type,
        action,
        response: item.response,
        text: this.formatText(item.response),
        execution: item
      });
    }
    return results;
  }

  async executeVirtual({ toolId, args = {}, context = {}, handler } = {}) {
    const startedAt = Date.now();
    const id = String(toolId || "").trim();
    if (typeof handler !== "function") throw new Error(`Virtual tool missing handler: ${id}`);
    this.ensureRunActive(context.signal || null);
    this.trace("INFO", "[Execution]", {
      tool: id,
      input: this.safeArgs(args),
      virtual: true,
      reason: "virtual verified task"
    });
    this.tracer?.record?.(context.traceId, "ToolExecutionService", "tool_execute", "running", {
      toolId: id,
      args: this.safeArgs(args),
      virtual: true
    });
    try {
      const output = await handler(args, context);
      return this.standardize({
        toolId: id,
        response: {
          success: Boolean(output?.success),
          result: output ?? null,
          error: output?.success ? null : (output?.error || "Virtual execution failed"),
          evidence: output?.evidence || [],
          duration: Date.now() - startedAt
        },
        startedAt,
        approval: { approved: true, reason: "virtual verified task", selectedTools: [{ id, virtual: true }] },
        traceId: context.traceId || ""
      });
    } catch (error) {
      return this.standardize({
        toolId: id,
        response: {
          success: false,
          result: null,
          error: error?.message || String(error),
          evidence: [],
          duration: Date.now() - startedAt
        },
        startedAt,
        approval: { approved: true, reason: "virtual verified task", selectedTools: [{ id, virtual: true }] },
        traceId: context.traceId || ""
      });
    }
  }

  standardize({ toolId, response = {}, startedAt, approval, traceId = "" }) {
    const duration = Date.now() - startedAt;
    const normalized = response && typeof response === "object" ? response : { success: true, result: response };
    normalized.meta = {
      ...(normalized.meta || {}),
      traceId: normalized.meta?.traceId || traceId,
      duration: normalized.meta?.duration ?? normalized.duration ?? duration,
      stdout: normalized.result?.stdout || normalized.stdout || normalized.meta?.stdout || "",
      stderr: normalized.result?.stderr || normalized.stderr || normalized.meta?.stderr || "",
      exitCode: normalized.result?.exitCode ?? normalized.exitCode ?? normalized.meta?.exitCode ?? null,
      returnValue: normalized.result?.returnValue ?? normalized.returnValue ?? normalized.meta?.returnValue ?? null
    };
    if (!("result" in normalized)) normalized.result = normalized.success ? normalized.message || "" : null;
    if (!("error" in normalized)) normalized.error = normalized.success ? null : (normalized.message || "Tool execution failed");
    const verification = this.verifier && normalized.success
      ? this.verifier.verify({ toolId, result: normalized, context: { approval } })
      : { verified: true, status: normalized.success ? "skipped" : "failed", checks: [], reason: normalized.success ? "未配置验证中心" : "工具执行失败，跳过验证" };
    normalized.verification = verification;
    if (normalized.success && verification && verification.verified === false) {
      normalized.success = false;
      normalized.error = verification.reason || "工具结果未通过验证";
    }
    normalized.meta = {
      ...normalized.meta,
      verification
    };
    const result = {
      success: Boolean(normalized.success),
      toolId,
      status: normalized.success ? "success" : "failed",
      result: normalized.result,
      error: normalized.success ? null : normalized.error,
      timestamp: new Date().toISOString(),
      duration: normalized.meta.duration,
      verification,
      response: normalized,
      approval
    };
    this.trace(result.success ? "INFO" : "WARN", "[Execution Result]", {
      tool: toolId,
      status: result.status,
      duration: result.duration,
      error: result.error || null
    });
    this.tracer?.record?.(traceId || normalized?.meta?.traceId || "", "ToolExecutionService", "tool_result", result.status, {
      toolId,
      duration: result.duration,
      status: result.status,
      error: result.error || null,
      verificationStatus: verification?.status || ""
    });
    try {
      require("./neural-core/agent-event-bus").recordRuntimeMetric?.("ToolExecutionService", {
        duration: result.duration,
        success: result.success
      });
    } catch {}
    return result;
  }

  safeArgs(args) {
    try {
      const clone = JSON.parse(JSON.stringify(args || {}));
      for (const key of Object.keys(clone)) {
        if (/apiKey|authorization|token|secret|password/i.test(key)) clone[key] = "***REDACTED***";
      }
      return clone;
    } catch {
      return {};
    }
  }

  failureResponse(toolId, error, startedAt) {
    let code = "NC3001";
    try { code = require("./neural-core/agent-event-bus").ERROR_CODES.TOOL_FAILURE; } catch {}
    const message = error?.message || String(error || "Tool execution failed");
    return {
      success: false,
      result: null,
      error: `${code} Tool Failure: ${message}`,
      evidence: [{ type: "tool-execution", tool: toolId, errorCode: code, message }],
      duration: Date.now() - startedAt,
      meta: { errorCode: code, recoverable: true }
    };
  }

  trace(level, message, meta = {}) {
    if (this.logger) this.logger("agent", level, message, meta);
  }
}

module.exports = { ToolExecutionService };
