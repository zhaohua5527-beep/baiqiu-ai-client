function normalizeAgentStatus(status) {
  const value = String(status || "success").toLowerCase();
  if (["success", "failed", "cancelled"].includes(value)) return value;
  if (["done", "completed", "ok"].includes(value)) return "success";
  if (["aborted", "abort"].includes(value)) return "cancelled";
  return "failed";
}

function createAgentResult(result = {}, strategy = "") {
  const status = normalizeAgentStatus(result.status || (result.success === false ? "failed" : "success"));
  return {
    success: typeof result.success === "boolean" ? result.success : status === "success",
    status,
    message: String(result.message ?? result.text ?? ""),
    tasks: Array.isArray(result.tasks) ? result.tasks : [],
    toolResults: Array.isArray(result.toolResults) ? result.toolResults : [],
    verification: result.verification ?? null,
    metadata: result.metadata || {},
    strategy: result.strategy || strategy,
    clientResponse: result.clientResponse || null,
    raw: result.raw || null
  };
}

module.exports = { createAgentResult, normalizeAgentStatus };
