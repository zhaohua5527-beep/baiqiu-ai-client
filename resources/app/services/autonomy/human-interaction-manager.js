const fs = require("node:fs");
const path = require("node:path");
const { DEFAULT_AUTONOMY_ROOT } = require("./autonomy-level-manager");

function nowIso() {
  return new Date().toISOString();
}

class HumanInteractionManager {
  constructor({ rootDir = DEFAULT_AUTONOMY_ROOT } = {}) {
    this.rootDir = rootDir;
    this.interactionsFile = path.join(rootDir, "human-interactions.json");
    this.ensureStore();
  }

  createRequest({ agentId = "default-agent", task = {}, boundary = {}, message = "" } = {}) {
    const request = {
      interactionId: `human-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      agentId,
      taskId: task.id || task.taskId || "",
      toolId: task.toolId || "",
      status: "pending",
      required: boundary.requiresHuman === true,
      boundaryStatus: boundary.status || "",
      message: message || this.defaultMessage(task, boundary),
      response: null,
      safety: {
        advisoryOnly: true,
        executesTool: false,
        modifiesPermission: false
      },
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    this.append(request);
    return request;
  }

  recordResponse(interactionId = "", response = {}) {
    const data = this.load();
    const index = data.interactions.findIndex((item) => item.interactionId === interactionId);
    if (index === -1) return null;
    data.interactions[index] = {
      ...data.interactions[index],
      status: response.approved === true ? "approved" : "rejected",
      response: {
        approved: response.approved === true,
        note: response.note || ""
      },
      updatedAt: nowIso()
    };
    this.writeJson(this.interactionsFile, { interactions: data.interactions });
    return data.interactions[index];
  }

  defaultMessage(task = {}, boundary = {}) {
    if (boundary.status === "confirm_required") return `Task ${task.id || task.taskId || ""} requires human confirmation.`;
    if (boundary.status === "policy_block") return `Task ${task.id || task.taskId || ""} is blocked by policy.`;
    if (boundary.status === "budget_exceeded") return `Task ${task.id || task.taskId || ""} exceeds governance budget.`;
    return `Task ${task.id || task.taskId || ""} requires review.`;
  }

  append(item = {}) {
    const data = this.load();
    data.interactions.push(item);
    this.writeJson(this.interactionsFile, { interactions: data.interactions.slice(-500) });
  }

  load() {
    return this.readJson(this.interactionsFile, { interactions: [] });
  }

  ensureStore() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.interactionsFile)) this.writeJson(this.interactionsFile, { interactions: [] });
  }

  readJson(file, fallback) {
    this.ensureStore();
    try {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      return fallback;
    }
  }

  writeJson(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  }
}

module.exports = { HumanInteractionManager };
