const path = require("node:path");
const { ProductSDK } = require("./product-sdk");
const { ProductEventAdapter } = require("./product-event-adapter");
const { TaskExperience } = require("./task-experience");

class UIAdapter {
  constructor({ productRoot, dataRoot, taskOrchestrator, planBuilder = null, conversationalResponder = null, chatRunner = null } = {}) {
    this.planBuilder = planBuilder;
    this.conversationalResponder = conversationalResponder;
    this.chatRunner = chatRunner;
    this.sdk = new ProductSDK({
      productRoot,
      dataRoot,
      adapter: new ProductEventAdapter({ taskOrchestrator })
    });
  }

  async submitUIInput(input = {}) {
    const message = String(input.message || input.text || "");
    const task = input.taskId ? {
      ...this.sdk.queryTask(input.taskId),
      ...input,
      input: input.input || message,
      message
    } : this.sdk.createTask({
      taskId: input.taskId || "",
      productId: input.productId || this.sdk.manifest?.id || "",
      templateId: input.templateId || "desktop.general_task",
      input: message,
      message,
      intent: input.intent || "",
      planObject: input.planObject || null,
      sessionId: input.sessionId || "",
      traceId: input.traceId || "",
      context: {
        ...(input.context || {}),
        ui: true,
        productLayer: true
      }
    });

    this.sdk.updateTaskExperience(task.taskId, "understanding", { message: "正在理解" });

    if (input.context?.chatRuntime || input.templateId === "desktop.chat_runtime") {
      const response = typeof this.chatRunner === "function"
        ? await this.chatRunner({ ...input, message, taskId: task.taskId })
        : { ok: false, text: "聊天运行通道不可用。", error: "chat_runner_missing" };
      return this.completeRuntimeTask(task, response);
    }

    if (input.context?.conversationOnly || input.templateId === "desktop.chat") {
      const responseText = await this.answerConversation({ ...input, message, taskId: task.taskId });
      return this.completeRuntimeTask(task, { ok: true, text: responseText });
    }

    const planObject = input.planObject || await this.buildPlan({ ...input, message, taskId: task.taskId });
    const planned = this.sdk.updateTaskExperience(task.taskId, "planning", {
      message: "正在规划",
      details: {
        intent: planObject?.primaryIntent || input.intent || "",
        plan: Array.isArray(planObject?.tasks) ? planObject.tasks.map((item) => item.title || item.id || item.toolId).filter(Boolean) : []
      }
    });
    const nextTask = {
      ...(planned || task),
      intent: planObject?.primaryIntent || input.intent || "",
      planObject
    };
    this.sdk.saveTask(nextTask);
    const completed = await this.sdk.submitTask(nextTask);
    return this.toUIResult(completed);
  }

  completeRuntimeTask(task = {}, response = {}) {
    const ok = response.ok !== false;
    const completed = {
      ...task,
      status: ok ? "success" : "failed",
      result: {
        success: ok,
        text: response.text || response.message || "",
        normalized: {
          success: ok,
          result: { text: response.text || response.message || "" },
          error: response.error || null
        },
        raw: response.raw || null
      },
      error: ok ? null : (response.error || "Product chat runtime failed"),
      updatedAt: new Date().toISOString()
    };
    completed.experience = TaskExperience.advance(completed, ok ? "completed" : "failed", {
      message: ok ? "已完成" : completed.error,
      result: completed.result
    });
    this.sdk.saveTask(completed);
    return this.toUIResult(completed);
  }

  queryTask(taskId = "") {
    return this.sdk.queryTask(taskId);
  }

  getTaskStatus(taskId = "") {
    return this.sdk.getTaskStatus(taskId);
  }

  getTaskResult(taskId = "") {
    return this.sdk.getTaskResult(taskId);
  }

  getTaskHistory(options = {}) {
    return this.sdk.getTaskHistory(options);
  }

  async buildPlan(input = {}) {
    if (typeof this.planBuilder !== "function") return input.planObject || null;
    return this.planBuilder(input);
  }

  async answerConversation(input = {}) {
    if (typeof this.conversationalResponder === "function") {
      const result = await this.conversationalResponder(input);
      if (typeof result === "string" && result.trim()) return result.trim();
      if (result?.text) return String(result.text).trim();
    }
    return "我在。你可以问我有哪些能力，也可以让我创建文件、处理表格、分析图片、打开网页，或执行桌面任务。";
  }

  toUIResult(task = {}) {
    const result = task.result?.result || task.result || {};
    const normalized = result.normalized || task.result?.normalized || null;
    return {
      taskId: task.taskId,
      productId: task.productId,
      status: task.status,
      success: task.status === "success",
      text: result.text || normalized?.result?.text || normalized?.error || task.error || "",
      result,
      experience: task.experience || null,
      traceId: task.traceId,
      updatedAt: task.updatedAt
    };
  }

  static desktopAssistantRoot(appRoot = process.cwd()) {
    return path.join(appRoot, "products", "desktop-assistant");
  }
}

module.exports = { UIAdapter };
