const fs = require("node:fs");
const path = require("node:path");
const { DEFAULT_WORKFLOW_ROOT } = require("./workflow-definition");

function nowIso() {
  return new Date().toISOString();
}

class WorkflowTemplateManager {
  constructor({ rootDir = DEFAULT_WORKFLOW_ROOT } = {}) {
    this.rootDir = rootDir;
    this.templatesFile = path.join(rootDir, "workflow-templates.json");
    this.ensureStore();
  }

  ensureDefaults() {
    const data = this.load();
    const defaults = [
      {
        templateId: "calculator_workflow",
        name: "Calculator Managed Workflow",
        taskType: "dev.code.calculator",
        stages: ["create_application", "save_result", "open_result"],
        version: 1
      },
      {
        templateId: "file_folder_workflow",
        name: "Folder File Managed Workflow",
        taskType: "file.folder",
        stages: ["create_folder", "create_file", "open_result"],
        version: 1
      },
      {
        templateId: "safe_review_workflow",
        name: "Safe Review Workflow",
        taskType: "system.shutdown",
        stages: ["human_confirmation"],
        version: 1
      }
    ];
    for (const item of defaults) {
      if (!data.templates[item.templateId]) {
        data.templates[item.templateId] = { ...item, createdAt: nowIso(), updatedAt: nowIso() };
      }
    }
    this.writeJson(this.templatesFile, { templates: data.templates });
  }

  select({ taskType = "", goal = {} } = {}) {
    const templates = Object.values(this.load().templates);
    return templates.find((item) => item.taskType === taskType)
      || templates.find((item) => item.stages?.some((stage) => (goal.requirements || []).includes(stage)))
      || templates.find((item) => item.templateId === "safe_review_workflow")
      || null;
  }

  upsert(template = {}) {
    const data = this.load();
    const templateId = template.templateId || `template-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const previous = data.templates[templateId] || {};
    const next = {
      ...previous,
      ...template,
      templateId,
      updatedAt: nowIso(),
      createdAt: previous.createdAt || nowIso()
    };
    data.templates[templateId] = next;
    this.writeJson(this.templatesFile, { templates: data.templates });
    return next;
  }

  load() {
    return this.readJson(this.templatesFile, { templates: {} });
  }

  ensureStore() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.templatesFile)) this.writeJson(this.templatesFile, { templates: {} });
    this.ensureDefaults();
  }

  readJson(file, fallback) {
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

module.exports = { WorkflowTemplateManager };
