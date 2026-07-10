class RetryManager {
  constructor({ maxAttempts = 3, logger = null, tracer = null } = {}) {
    this.maxAttempts = Number(maxAttempts) || 3;
    this.logger = logger;
    this.tracer = tracer;
  }

  async run(operation, { sessionId = "", traceId = "", recover = null, shouldRetry = null } = {}) {
    const attempts = [];
    let last = null;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      this.logger?.log?.("retry", "attempt", { sessionId, attempt });
      this.tracer?.record?.(traceId, "RetryManager", "attempt", "running", { sessionId, attempt });
      try {
        const result = await operation({ attempt, previous: last });
        last = result;
        attempts.push({ attempt, success: this.isSuccess(result), action: "execute" });
        if (this.isSuccess(result)) {
          this.logger?.log?.("retry", "success", { sessionId, attempt });
          this.tracer?.record?.(traceId, "RetryManager", "success", "success", { sessionId, attempt });
          return { ...result, reliability: { attempts, retryCount: attempt - 1 } };
        }
        const retryable = typeof shouldRetry === "function" ? shouldRetry(result, attempt) : attempt < this.maxAttempts;
        if (!retryable || attempt >= this.maxAttempts) break;
        if (attempt === 2 && typeof recover === "function") {
          const recovery = await recover({ attempt, result });
          attempts.push({ attempt, success: false, action: "recover", recovery });
          this.tracer?.record?.(traceId, "RetryManager", "recover", "running", { sessionId, attempt, recovery });
        }
      } catch (error) {
        last = { normalized: { success: false, error: error?.message || String(error) }, error: error?.message || String(error) };
        attempts.push({ attempt, success: false, action: "exception", error: error?.message || String(error) });
        this.tracer?.record?.(traceId, "RetryManager", "exception", "failed", { sessionId, attempt, error: error?.message || String(error) });
        if (attempt >= this.maxAttempts) break;
      }
    }
    const failed = this.decorateFailure(last, attempts);
    this.logger?.log?.("retry", "failed", { sessionId, attempts });
    this.tracer?.record?.(traceId, "RetryManager", "failed", "failed", { sessionId, attempts });
    return failed;
  }

  isSuccess(result) {
    return Boolean(result?.normalized?.success ?? result?.success);
  }

  decorateFailure(result, attempts) {
    const base = result && typeof result === "object" ? { ...result } : {};
    base.normalized = {
      ...(base.normalized || {}),
      success: false,
      error: base.normalized?.error || base.error || "任务重试后仍失败。"
    };
    base.reliability = {
      ...(base.reliability || {}),
      attempts,
      retryCount: Math.max(0, attempts.length - 1)
    };
    return base;
  }
}

module.exports = { RetryManager };
