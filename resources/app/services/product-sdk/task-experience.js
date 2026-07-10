const STAGE_LABELS = Object.freeze({
  received: "已接收",
  understanding: "正在理解",
  planning: "正在规划",
  executing: "正在执行",
  verifying: "正在验证",
  completed: "已完成",
  failed: "执行失败"
});

const STAGE_PROGRESS = Object.freeze({
  received: 5,
  understanding: 18,
  planning: 36,
  executing: 68,
  verifying: 88,
  completed: 100,
  failed: 100
});

function nowIso() {
  return new Date().toISOString();
}

class TaskExperience {
  static create(task = {}, stage = "received", patch = {}) {
    const currentStage = STAGE_LABELS[stage] ? stage : "received";
    return {
      taskId: task.taskId || "",
      title: patch.title || this.titleFor(task),
      status: patch.status || this.statusForStage(currentStage),
      progress: Number.isFinite(Number(patch.progress)) ? Number(patch.progress) : STAGE_PROGRESS[currentStage],
      currentStage,
      message: patch.message || STAGE_LABELS[currentStage],
      result: patch.result || null,
      timeline: Array.isArray(patch.timeline) ? patch.timeline : [{
        stage: currentStage,
        label: STAGE_LABELS[currentStage],
        message: patch.message || STAGE_LABELS[currentStage],
        at: nowIso()
      }],
      details: patch.details || {}
    };
  }

  static advance(task = {}, stage = "received", patch = {}) {
    const previous = task.experience || this.create(task);
    const currentStage = STAGE_LABELS[stage] ? stage : "received";
    const item = {
      stage: currentStage,
      label: STAGE_LABELS[currentStage],
      message: patch.message || STAGE_LABELS[currentStage],
      at: nowIso(),
      details: patch.details || null
    };
    return {
      ...previous,
      taskId: task.taskId || previous.taskId || "",
      title: patch.title || previous.title || this.titleFor(task),
      status: patch.status || this.statusForStage(currentStage),
      progress: Number.isFinite(Number(patch.progress)) ? Number(patch.progress) : STAGE_PROGRESS[currentStage],
      currentStage,
      message: item.message,
      result: patch.result === undefined ? previous.result : patch.result,
      timeline: [...(previous.timeline || []), item],
      details: {
        ...(previous.details || {}),
        ...(patch.details || {})
      }
    };
  }

  static output(task = {}) {
    return task.experience || this.create(task);
  }

  static titleFor(task = {}) {
    const message = String(task.message || task.input || "").trim();
    if (!message) return task.productName || "产品任务";
    return message.length > 28 ? `${message.slice(0, 28)}...` : message;
  }

  static statusForStage(stage = "") {
    if (stage === "completed") return "success";
    if (stage === "failed") return "failed";
    if (stage === "received") return "created";
    return "running";
  }
}

module.exports = { TaskExperience, STAGE_LABELS, STAGE_PROGRESS };
