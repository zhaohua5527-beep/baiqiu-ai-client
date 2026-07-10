function wantsTechnicalLog(context = {}) {
  return /显示.*日志|执行日志|技术日志|debug|trace/i.test(String(context.userMessage || context.message || ""));
}

function cleanError(error) {
  const raw = typeof error === "object" && error ? (error.message || JSON.stringify(error)) : String(error || "");
  const first = raw.replace(/\r/g, "\n").split("\n").filter(Boolean)[0] || "未知原因";
  if (/permission|access\s*denied|eacces|eperm|权限/i.test(first)) return "权限不足，请检查权限设置后重试。";
  if (/timeout|timed?\s*out|超时/i.test(first)) return "任务响应超时，请稍后重试。";
  if (/not\s*found|enoent|不存在|找不到/i.test(first)) return "文件或目标不存在。";
  if (/network|fetch|econn|dns|socket|联网/i.test(first)) return "网络连接失败，请检查网络后重试。";
  return first
    .replace(/^Error:\s*/i, "")
    .replace(/^Exception:\s*/i, "")
    .replace(/^Failed:\s*/i, "失败：")
    .replace(/\b(toolId|command|stack)\b\s*[:=].*/gi, "")
    .slice(0, 180)
    .trim() || "未知原因";
}

function safeLabel(value = "") {
  const text = String(value || "");
  const desktop = text.match(/(?:桌面|Desktop)[\\/]+([^\\/]+)$/i);
  if (desktop) return `桌面/${desktop[1]}`;
  if (/^[A-Za-z]:[\\/]/.test(text)) return text.split(/[\\/]/).slice(-2).join("/");
  return text.replace(/\btoolId\s*[:=]\s*\S+/gi, "").replace(/\{[\s\S]*\}/g, "").trim();
}

function latestVerification(queueResult = {}) {
  const results = Array.isArray(queueResult.results) ? queueResult.results : [];
  for (let i = results.length - 1; i >= 0; i -= 1) {
    const verification = results[i]?.verification || results[i]?.execution?.verification || results[i]?.execution?.response?.verification;
    if (verification) return verification;
  }
  return null;
}

function outputFromResult(item = {}) {
  const result = item.result || item.execution?.response?.result || {};
  return result?.output || result?.result || result;
}

class ReplyBuilder {
  constructor({ tracer = null, developerMode = false } = {}) {
    this.tracer = tracer;
    this.developerMode = Boolean(developerMode);
  }

  build({ taskResult = {}, verification = null, context = {} } = {}) {
    if (wantsTechnicalLog(context)) return this.buildTechnical({ taskResult, verification });
    const queueResult = taskResult.queueResult || taskResult;
    const finalVerification = verification || latestVerification(queueResult);
    const success = Boolean(queueResult.success) && (!finalVerification || finalVerification.status === "passed" || finalVerification.status === "skipped");
    const reply = success
      ? this.buildSuccess({ queueResult, verification: finalVerification, context })
      : this.buildFailure({ queueResult, verification: finalVerification, context });
    if (this.developerMode && context.traceId) reply.text = `${reply.text}\n\n任务编号：${context.traceId}`;
    this.tracer?.record?.(context.traceId, "ReplyBuilder", "build_reply", reply.status, {
      displayType: reply.displayType,
      text: reply.text.slice(0, 500)
    });
    return reply;
  }

  buildSuccess({ queueResult = {}, context = {} } = {}) {
    const results = Array.isArray(queueResult.results) ? queueResult.results : [];
    const last = results[results.length - 1] || {};
    const output = outputFromResult(last);
    const lines = ["任务完成。", ""];

    const file = output?.file || output?.files?.[0]?.label || output?.files?.[0]?.file || output?.label || "";
    if (file) {
      lines.push("位置：");
      lines.push(safeLabel(file));
      lines.push("");
    }

    if (results.length > 1) {
      lines.push("已执行：");
      results.forEach((item, index) => {
        lines.push(`${index + 1}. ${item.task?.title || item.planTask?.title || "任务步骤"}`);
      });
      lines.push("");
    }

    const opened = output?.opened || output?.openUrl || output?.browser || output?.browserVerified;
    lines.push("状态：");
    lines.push(opened ? "已打开并验证成功。" : "已验证成功。");
    return { text: lines.join("\n").trim(), status: "success", displayType: "normal" };
  }

  buildFailure({ queueResult = {}, verification = null } = {}) {
    const failedTask = queueResult.failedTask?.title || queueResult.results?.find((item) => !item.success)?.task?.title || "任务步骤";
    const reason = cleanError(verification?.reason || queueResult.error || "任务未通过验证");
    return {
      text: [
        "任务执行失败。",
        "",
        "任务：",
        failedTask,
        "",
        "原因：",
        reason,
        "",
        "建议：",
        "检查目标文件、权限或网络状态后重试。"
      ].join("\n"),
      status: "failed",
      displayType: "normal"
    };
  }

  buildTechnical({ taskResult = {}, verification = null } = {}) {
    const queueResult = taskResult.queueResult || taskResult;
    const payload = {
      status: queueResult.status || (queueResult.success ? "success" : "failed"),
      tasks: (queueResult.tasks || []).map((task) => ({
        id: task.id,
        title: task.title,
        toolId: task.toolId,
        status: task.status,
        error: task.error || null
      })),
      verification: verification || latestVerification(queueResult)
    };
    return {
      text: `执行日志：\n${JSON.stringify(payload, null, 2)}`,
      status: queueResult.success ? "success" : "failed",
      displayType: "technical"
    };
  }
}

module.exports = { ReplyBuilder };
