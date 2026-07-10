const VALID_STATES = new Set(["waiting", "running", "success", "failed", "cancelled", "verifying", "retry", "timeout"]);
const TERMINAL_STATES = new Set(["success", "failed", "timeout", "cancelled"]);
const { getDefaultAgentStateManager } = require("./agent_state_manager");
const { getDefaultAgentEventBus, AGENT_EVENTS } = require("./neural-core/agent-event-bus");

class TaskQueue {
  constructor({ loadDb, saveDb, idFactory = null, stateManager = null, eventBus = null } = {}) {
    this.loadDb = loadDb;
    this.saveDb = saveDb;
    this.idFactory = idFactory || (() => `task-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`);
    this.stateManager = stateManager || getDefaultAgentStateManager();
    this.eventBus = eventBus || getDefaultAgentEventBus();
  }

  enqueue(sessionId, task = {}) {
    const db = this.loadDb();
    db.queue ||= [];
    const id = task.id || this.idFactory();
    const existing = db.queue.find((item) => item.id === id && item.sessionId === sessionId);
    if (existing) {
      try {
        require("./neural-core/agent-event-bus").recordRuntimeMetric?.("TaskQueue.idempotency", {
          duration: 0,
          success: true,
          hit: true
        });
      } catch {}
      return existing;
    }
    const item = {
      id,
      taskId: task.taskId || id,
      parentTaskId: task.parentTaskId || "",
      sessionId,
      name: task.name || task.title || task.type || "task",
      title: task.title || task.name || task.type || "task",
      type: task.type || "task",
      intent: task.intent || "",
      toolId: task.toolId || "",
      status: this.normalizeStatus(task.status || "waiting"),
      dependsOn: Array.isArray(task.dependsOn) ? task.dependsOn : [],
      retryLimit: Number.isFinite(Number(task.retryLimit)) ? Number(task.retryLimit) : 1,
      attempts: Number(task.attempts || 0),
      createdAt: task.createdAt || Date.now(),
      updatedAt: Date.now(),
      startedAt: task.startedAt || null,
      finishedAt: task.finishedAt || null,
      result: task.result || null,
      verification: task.verification || null,
      error: task.error || null
    };
    db.queue.push(item);
    this.saveDb(db);
    return item;
  }

  enqueuePlan(sessionId, plan) {
    return (plan.tasks || []).map((task) => this.enqueue(sessionId, task));
  }

  update(taskId, patch = {}) {
    const db = this.loadDb();
    db.queue ||= [];
    const task = db.queue.find((item) => item.id === taskId);
    if (!task) return null;
    if (patch.status) task.status = this.normalizeStatus(patch.status);
    for (const [key, value] of Object.entries(patch)) {
      if (key === "status") continue;
      task[key] = value;
    }
    if (task.status === "running" && !task.startedAt) task.startedAt = Date.now();
    if (TERMINAL_STATES.has(task.status)) task.finishedAt = Date.now();
    task.updatedAt = Date.now();
    this.saveDb(db);
    return task;
  }

  failOrRetry(taskId, error) {
    const db = this.loadDb();
    const task = (db.queue || []).find((item) => item.id === taskId);
    if (!task) return null;
    const attempts = Number(task.attempts || 0) + 1;
    const retryLimit = Number(task.retryLimit || 0);
    return this.update(taskId, {
      attempts,
      status: attempts <= retryLimit ? "retry" : "failed",
      error: error?.message || String(error || "task failed")
    });
  }

  async executePlan({ sessionId, plan, context = {}, selectTool, executeTool, ensureActive = null, onChange = null, replanner = null } = {}) {
    if (!sessionId) throw new Error("TaskQueue.executePlan requires sessionId");
    if (!plan || !Array.isArray(plan.tasks)) throw new Error("TaskQueue.executePlan requires plan.tasks");
    if (typeof selectTool !== "function") throw new Error("TaskQueue.executePlan requires selectTool");
    if (typeof executeTool !== "function") throw new Error("TaskQueue.executePlan requires executeTool");

    const executableTasks = plan.tasks
      .filter((task) => task && task.executable !== false && (task.toolId || task.intent))
      .map((task, index) => ({ ...task, contextKey: task.contextKey || `step${index + 1}` }));
    const queued = executableTasks.map((task) => this.enqueue(sessionId, {
      ...task,
      id: `${plan.id || "plan"}:${task.id || this.idFactory()}`,
      taskId: task.taskId || task.id || "",
      parentTaskId: plan.id || "",
      name: task.name || task.title || task.toolId || task.intent,
      title: task.title || task.name || task.toolId || task.intent,
      status: "waiting"
    }));
    onChange?.({ type: "queued", tasks: queued });

    const results = [];
    const taskContext = this.stateManager.getTaskContext(sessionId, {
      taskId: plan.id || "",
      userIntent: plan.primaryIntent || "",
      goal: plan.goal || plan.sourceText || context.userMessage || "",
      plan,
      taskContext: context.taskContext || {}
    });
    let replanCount = 0;
    for (let index = 0; index < queued.length; index += 1) {
      const queueTask = queued[index];
      const planTask = executableTasks[index];
      try {
        ensureActive?.();
        this.update(queueTask.id, { status: "running", attempts: Number(queueTask.attempts || 0) + 1 });
        this.eventBus.publish(AGENT_EVENTS.TOOL_EXECUTING, {
          sessionId,
          traceId: context.traceId || "",
          intent: planTask.intent,
          taskId: queueTask.id,
          currentAgent: "executor",
          taskContext
        });
        onChange?.({ type: "running", task: queueTask });

        this.eventBus.publish(AGENT_EVENTS.TOOL_SELECTED, {
          sessionId,
          traceId: context.traceId || "",
          intent: planTask.intent,
          toolId: planTask.toolId || "",
          taskId: queueTask.id,
          currentAgent: "tool_selector",
          taskContext
        });
        const selection = await selectTool({ intent: planTask.intent, task: planTask, context });
        const selectedTool = selection?.selectedTools?.[0] || {};
        const toolId = planTask.toolId || selectedTool.id;
        if (!toolId) throw new Error(`No tool selected for task: ${planTask.title || planTask.id}`);

        const args = this.resolveBindings(planTask.args || selectedTool.params || { message: context.userMessage || "" }, taskContext);
        const execution = await executeTool({
          toolId,
          args,
          task: planTask,
          context: {
            ...context,
            agentIntent: planTask.intent || context.agentIntent || "",
            taskMessage: planTask.title || planTask.name || context.userMessage || "",
            taskId: queueTask.id,
            planId: plan.id || ""
          }
        });
        const success = Boolean(execution?.success);
        const result = execution?.response?.result ?? execution?.result ?? null;
        const verification = execution?.verification || execution?.response?.verification || null;
        const error = execution?.error || execution?.response?.error || null;
        const outputs = this.extractOutputs({ toolId, success, result, execution, args });
        this.bindTaskOutput(taskContext, planTask, index, { taskId: planTask.id || queueTask.taskId, toolId, success, outputs });
        this.eventBus.publish(AGENT_EVENTS.TOOL_RESULT, {
          sessionId,
          traceId: context.traceId || "",
          taskId: planTask.id || queueTask.taskId,
          toolId,
          success,
          status: success ? "success" : "failed",
          error
        });
        this.eventBus.publish(AGENT_EVENTS.VERIFICATION_DONE, {
          sessionId,
          traceId: context.traceId || "",
          verification: verification || { status: success ? "passed" : "failed", reason: error || "" },
          status: success ? "passed" : "failed",
          reason: error || ""
        });
        this.update(queueTask.id, {
          status: success ? "success" : "failed",
          toolId,
          result,
          outputs,
          verification,
          error: success ? null : error
        });
        results.push({ task: queueTask, planTask, toolId, args, execution, success, result, outputs, verification, error });
        onChange?.({ type: success ? "success" : "failed", task: queueTask, execution });

        if (!success) {
          const applied = this.applyReplan({
            sessionId,
            plan,
            executableTasks,
            queued,
            index,
            results,
            taskContext,
            replanner,
            replanCount,
            failedTask: { task: queueTask, planTask: { ...planTask, args }, toolId, args, execution, error },
            error,
            onChange
          });
          if (applied.applied) {
            replanCount += 1;
            index -= 1;
            continue;
          }
          this.cancelPending(queued.slice(index + 1), `previous task failed: ${queueTask.title}`);
          this.eventBus.publish(AGENT_EVENTS.TASK_FAILED, { sessionId, traceId: context.traceId || "", lastError: error || `task failed: ${queueTask.title}`, taskContext });
          return { success: false, status: "failed", failedTask: queueTask, tasks: queued, results, taskContext, error: error || `task failed: ${queueTask.title}` };
        }
      } catch (error) {
        const cancelled = error?.code === "TASK_CANCELLED" || /cancel|abort|终止|取消/i.test(String(error?.message || error));
        this.update(queueTask.id, { status: cancelled ? "cancelled" : "failed", error: error?.message || String(error) });
        if (!cancelled) {
          const applied = this.applyReplan({
            sessionId,
            plan,
            executableTasks,
            queued,
            index,
            results,
            taskContext,
            replanner,
            replanCount,
            failedTask: { task: queueTask, planTask, toolId: planTask?.toolId || "", args: planTask?.args || {}, execution: null, error },
            error,
            onChange
          });
          if (applied.applied) {
            replanCount += 1;
            index -= 1;
            continue;
          }
        }
        this.cancelPending(queued.slice(index + 1), cancelled ? "task cancelled" : `previous task failed: ${queueTask.title}`);
        this.eventBus.publish(AGENT_EVENTS.TASK_FAILED, { sessionId, traceId: context.traceId || "", lastError: error?.message || String(error), taskContext });
        return { success: false, status: cancelled ? "cancelled" : "failed", failedTask: queueTask, tasks: queued, results, taskContext, error: error?.message || String(error) };
      }
    }

    this.eventBus.publish(AGENT_EVENTS.TASK_COMPLETED, { sessionId, traceId: context.traceId || "", taskContext });
    return { success: true, status: "success", tasks: queued, results, taskContext, error: null };
  }

  cancelPending(tasks = [], reason = "previous task stopped") {
    for (const task of tasks) this.update(task.id, { status: "cancelled", error: reason });
  }

  applyReplan({ sessionId, plan, executableTasks, queued, index, results, taskContext, replanner, replanCount, failedTask, error, onChange = null } = {}) {
    if (!replanner || typeof replanner.replan !== "function") return { applied: false, reason: "no replanner" };
    const currentTask = failedTask?.planTask || executableTasks[index] || {};
    const decision = replanner.replan({
      originalPlan: plan,
      currentTask,
      completedTasks: results.filter((item) => item.success),
      failedTask,
      taskContext,
      error,
      replanCount
    });
    if (!decision || decision.action === "abort") return { applied: false, decision };

    if (decision.action === "skip") {
      this.update(failedTask.task.id, { status: "success", error: null, skipped: true, replan: decision });
      if (results.length && results[results.length - 1]?.task?.id === failedTask.task.id) results.pop();
      results.push({ ...failedTask, success: true, skipped: true, replan: decision, result: null, outputs: {} });
      onChange?.({ type: "replan", action: "skip", decision, task: failedTask.task });
      return { applied: true, decision };
    }

    const replacementSteps = this.stepsForReplan(decision, currentTask);
    if (!replacementSteps.length) return { applied: false, decision };

    this.update(failedTask.task.id, { status: "cancelled", error: `replanned: ${decision.reason || decision.action}`, replan: decision });
    if (results.length && results[results.length - 1]?.task?.id === failedTask.task.id) results.pop();

    const queuedSteps = replacementSteps.map((step, offset) => this.enqueue(sessionId, {
      ...step,
      id: `${plan.id || "plan"}:replan-${replanCount + 1}-${index + 1}-${offset + 1}-${step.id || this.idFactory()}`,
      taskId: step.taskId || step.id || "",
      parentTaskId: plan.id || "",
      name: step.name || step.title || step.toolId || step.intent,
      title: step.title || step.name || step.toolId || step.intent,
      status: "waiting"
    }));
    executableTasks.splice(index, 1, ...replacementSteps);
    queued.splice(index, 1, ...queuedSteps);
    onChange?.({ type: "replan", action: decision.action, decision, tasks: queuedSteps });
    return { applied: true, decision };
  }

  stepsForReplan(decision = {}, currentTask = {}) {
    if (decision.action === "retry") return [{ ...currentTask, retryLimit: 0 }];
    if (decision.action === "replace" || decision.action === "insert") {
      return (decision.newSteps || []).map((step) => ({
        ...step,
        retryLimit: Number.isFinite(Number(step.retryLimit)) ? Number(step.retryLimit) : 0,
        contextKey: step.contextKey || currentTask.contextKey
      }));
    }
    return [];
  }

  resolveBindings(value, taskContext = {}) {
    if (typeof value === "string") {
      return value.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, key) => {
        const resolved = this.lookupBinding(taskContext, key);
        return resolved == null ? "" : String(resolved);
      });
    }
    if (Array.isArray(value)) return value.map((item) => this.resolveBindings(item, taskContext));
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, this.resolveBindings(item, taskContext)]));
    }
    return value;
  }

  lookupBinding(taskContext = {}, key = "") {
    return String(key || "").split(".").filter(Boolean).reduce((current, part) => {
      if (current == null) return undefined;
      return current[part];
    }, taskContext);
  }

  bindTaskOutput(taskContext, task, index, record) {
    const stepKey = task?.contextKey || `step${index + 1}`;
    taskContext[stepKey] = { ...(record.outputs || {}), record };
    taskContext.steps ||= [];
    const stepMatch = /^step(\d+)$/i.exec(stepKey);
    if (stepMatch) {
      taskContext.steps[Number(stepMatch[1]) - 1] = taskContext[stepKey];
    } else {
      taskContext.replans ||= {};
      taskContext.replans[stepKey] = taskContext[stepKey];
    }
    taskContext.byId ||= {};
    for (const id of [task?.id, task?.taskId].filter(Boolean)) taskContext.byId[id] = taskContext[stepKey];
  }

  extractOutputs({ toolId = "", success = false, result = null, execution = null, args = {} } = {}) {
    const source = result && typeof result === "object" ? result : {};
    const output = source.output && typeof source.output === "object" ? source.output : source;
    const responseResult = execution?.response?.result || {};
    const files = Array.isArray(output.files) ? output.files : (Array.isArray(responseResult.files) ? responseResult.files : []);
    const firstFile = files.find(Boolean) || null;
    const outputs = {};
    const folder = output.folder || (toolId === "create_folder" ? output.path : "") || "";
    const file = output.file || firstFile?.file || firstFile?.path || firstFile?.label || (toolId === "write_text_file" ? args.path : "") || "";
    const pathValue = output.path || args.path || file || folder || "";
    if (file) outputs.file = file;
    if (folder) outputs.folder = folder;
    if (pathValue) outputs.path = pathValue;
    if (files.length) {
      outputs.files = files;
      outputs.firstFile = firstFile?.file || firstFile?.path || firstFile?.label || "";
    }
    if (output.openUrl) outputs.openUrl = output.openUrl;
    if (output.url) outputs.url = output.url;
    if (success) outputs.success = true;
    return outputs;
  }

  cancelSession(sessionId, reason = "user cancelled task") {
    const db = this.loadDb();
    db.queue ||= [];
    const cancelled = [];
    for (const task of db.queue) {
      if (task.sessionId !== sessionId) continue;
      if (TERMINAL_STATES.has(task.status)) continue;
      task.status = "cancelled";
      task.error = reason;
      task.finishedAt = Date.now();
      task.updatedAt = Date.now();
      cancelled.push(task);
    }
    this.saveDb(db);
    return cancelled;
  }

  list(sessionId = "") {
    const db = this.loadDb();
    const items = db.queue || [];
    return sessionId ? items.filter((item) => item.sessionId === sessionId) : items;
  }

  normalizeStatus(status) {
    const value = String(status || "waiting").toLowerCase();
    return VALID_STATES.has(value) ? value : "waiting";
  }
}

module.exports = { TaskQueue, VALID_STATES };
