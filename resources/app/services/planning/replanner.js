const path = require("node:path");
const { dataRoot } = require("../data-root");
const { ExperienceCenter } = require("../experience/experience-center");

const DEFAULT_SAFE_ROOT = path.join(dataRoot(), "workspace");

function errorText(value) {
  return String(value?.message || value || "").trim();
}

function cloneStep(step = {}, patch = {}) {
  return {
    ...step,
    ...patch,
    args: { ...(step.args || {}), ...(patch.args || {}) },
    dependsOn: Array.isArray(patch.dependsOn) ? patch.dependsOn : (Array.isArray(step.dependsOn) ? step.dependsOn : [])
  };
}

function nextAvailableName(filePath = "") {
  const parsed = path.parse(String(filePath || ""));
  if (!parsed.base) return filePath;
  return path.join(parsed.dir, `${parsed.name}(1)${parsed.ext}`);
}

function parentFolder(filePath = "") {
  const value = String(filePath || "");
  if (!value || /\{\{/.test(value)) return "";
  return path.dirname(value);
}

function safeWorkspacePath(filePath = "") {
  const base = path.basename(String(filePath || "recovered.txt")) || "recovered.txt";
  return path.join(DEFAULT_SAFE_ROOT, base);
}

class Replanner {
  constructor({ maxReplans = 1, safeRoot = DEFAULT_SAFE_ROOT, experienceCenter = null } = {}) {
    this.maxReplans = maxReplans;
    this.safeRoot = safeRoot;
    this.experienceCenter = experienceCenter || new ExperienceCenter();
    this.rules = [
      {
        name: "permission_denied",
        matches: ({ text }) => /permission|EACCES|EPERM|\u6743\u9650/i.test(text),
        build: () => ({ action: "abort", newSteps: [], reason: "permission denied" })
      },
      {
        name: "file_exists",
        matches: ({ text }) => /exists|EEXIST|\u5df2\u5b58\u5728/i.test(text),
        build: ({ currentTask }) => {
          const currentPath = currentTask?.args?.path || "";
          if (!currentPath) return { action: "retry", newSteps: [], reason: "file exists but no path was provided" };
          return {
            action: "replace",
            newSteps: [cloneStep(currentTask, {
              title: `${currentTask.title || currentTask.name || currentTask.toolId} (renamed)`,
              args: { path: nextAvailableName(currentPath) },
              contextKey: currentTask.contextKey
            })],
            reason: "file already exists, using a numbered filename"
          };
        }
      },
      {
        name: "missing_folder",
        matches: ({ text }) => /ENOENT|folder.*not.*exist|directory.*not.*exist|\u76ee\u5f55\u4e0d\u5b58\u5728|\u6587\u4ef6\u5939\u4e0d\u5b58\u5728/i.test(text),
        build: ({ currentTask }) => {
          const folder = parentFolder(currentTask?.args?.path || currentTask?.args?.file || "");
          if (!folder || folder === ".") return { action: "retry", newSteps: [], reason: "target folder missing but no parent path was available" };
          const repairId = `${currentTask.id || "task"}.replan.create_folder`;
          return {
            action: "insert",
            newSteps: [
              {
                id: repairId,
                taskId: repairId,
                name: "create missing folder",
                title: "create missing folder",
                intent: "file.create",
                type: "tool",
                toolId: "create_folder",
                args: { path: folder },
                dependsOn: [],
                retryLimit: 0,
                verifier: "folder_exists",
                executable: true,
                contextKey: `replan${Date.now()}`
              },
              cloneStep(currentTask, {
                dependsOn: [repairId],
                contextKey: currentTask.contextKey
              })
            ],
            reason: "target folder missing, inserting create_folder before retry"
          };
        }
      },
      {
        name: "browser_missing",
        matches: ({ toolId, text }) => toolId === "browser_open" && /edge|browser.*not.*found|\u6d4f\u89c8\u5668.*\u672a\u627e\u5230/i.test(text),
        build: ({ currentTask }) => ({
          action: "replace",
          newSteps: [cloneStep(currentTask, {
            toolId: "open_path",
            verifier: "open_path",
            contextKey: currentTask.contextKey
          })],
          reason: "browser_open could not find Edge, using the system default opener"
        })
      },
      {
        name: "invalid_path",
        matches: ({ text }) => /not allowed|invalid path|\u8def\u5f84\u4e0d\u5728\u5141\u8bb8\u8303\u56f4|\u8def\u5f84\u65e0\u6548/i.test(text),
        build: ({ currentTask }) => {
          const oldPath = currentTask?.args?.path || currentTask?.args?.file || "";
          if (!oldPath) return { action: "abort", newSteps: [], reason: "invalid path without a recoverable target" };
          return {
            action: "replace",
            newSteps: [cloneStep(currentTask, {
              args: { path: path.join(this.safeRoot, path.basename(String(oldPath))) },
              contextKey: currentTask.contextKey
            })],
            reason: "path was outside the allowed area, retrying in the allowed workspace"
          };
        }
      },
      {
        name: "recoverable",
        matches: ({ recoverable }) => recoverable === true,
        build: ({ currentTask }) => ({
          action: "retry",
          newSteps: [cloneStep(currentTask, { contextKey: currentTask.contextKey })],
          reason: "tool marked the failure as recoverable"
        })
      }
    ];
  }

  replan({ originalPlan = {}, currentTask = {}, completedTasks = [], failedTask = {}, taskContext = {}, error = "", replanCount = 0 } = {}) {
    if (replanCount >= this.maxReplans) {
      return { action: "abort", newSteps: [], reason: "replan limit reached" };
    }
    const execution = failedTask.execution || {};
    const text = [
      errorText(error),
      errorText(failedTask.error),
      errorText(execution.error),
      errorText(execution?.response?.error),
      errorText(execution?.result?.error),
      errorText(execution?.response?.result?.error)
    ].filter(Boolean).join(" ");
    const toolId = failedTask.toolId || currentTask.toolId || "";
    const recoverable = Boolean(
      failedTask.recoverable ||
      execution.recoverable ||
      execution?.result?.recoverable ||
      execution?.response?.result?.recoverable
    );
    const input = { originalPlan, currentTask, completedTasks, failedTask, taskContext, text, toolId, recoverable };
    const experienceDecision = this.decisionFromExperience(input);
    if (experienceDecision) return experienceDecision;
    const rule = this.rules.find((item) => item.matches(input));
    if (!rule) return { action: "abort", newSteps: [], reason: "fatal or unrecoverable failure" };
    const decision = rule.build(input);
    return {
      action: decision.action || "abort",
      newSteps: Array.isArray(decision.newSteps) ? decision.newSteps : [],
      reason: decision.reason || rule.name,
      rule: rule.name,
      solution: this.solutionForRule(rule.name)
    };
  }

  decisionFromExperience(input = {}) {
    const errorType = this.classifyError(input);
    const recommendation = this.experienceCenter?.recommend?.({
      taskType: input.currentTask?.intent || "",
      toolId: input.toolId || "",
      errorType,
      errorPattern: input.text || ""
    });
    if (!recommendation?.found) return null;
    const solution = recommendation.recommendedAction;
    const decision = this.buildFromSolution(solution, input);
    if (!decision) return null;
    return {
      ...decision,
      rule: errorType || "experience",
      solution,
      experienceId: recommendation.experience?.experienceId || "",
      reason: `experience recommended: ${solution}`
    };
  }

  buildFromSolution(solution, input = {}) {
    const currentTask = input.currentTask || {};
    if (solution === "rename_file") {
      const currentPath = currentTask?.args?.path || "";
      if (!currentPath) return null;
      return {
        action: "replace",
        newSteps: [cloneStep(currentTask, {
          title: `${currentTask.title || currentTask.name || currentTask.toolId} (renamed)`,
          args: { path: nextAvailableName(currentPath) },
          contextKey: currentTask.contextKey
        })]
      };
    }
    if (solution === "create_folder") {
      const folder = parentFolder(currentTask?.args?.path || currentTask?.args?.file || "");
      if (!folder || folder === ".") return null;
      const repairId = `${currentTask.id || "task"}.experience.create_folder`;
      return {
        action: "insert",
        newSteps: [
          {
            id: repairId,
            taskId: repairId,
            name: "create missing folder",
            title: "create missing folder",
            intent: "file.create",
            type: "tool",
            toolId: "create_folder",
            args: { path: folder },
            dependsOn: [],
            retryLimit: 0,
            verifier: "folder_exists",
            executable: true,
            contextKey: `experience${Date.now()}`
          },
          cloneStep(currentTask, { dependsOn: [repairId], contextKey: currentTask.contextKey })
        ]
      };
    }
    if (solution === "open_path") {
      return {
        action: "replace",
        newSteps: [cloneStep(currentTask, { toolId: "open_path", verifier: "open_path", contextKey: currentTask.contextKey })]
      };
    }
    if (solution === "use_workspace") {
      const oldPath = currentTask?.args?.path || currentTask?.args?.file || "";
      if (!oldPath) return null;
      return {
        action: "replace",
        newSteps: [cloneStep(currentTask, {
          args: { path: path.join(this.safeRoot, path.basename(String(oldPath))) },
          contextKey: currentTask.contextKey
        })]
      };
    }
    if (solution === "retry") return { action: "retry", newSteps: [cloneStep(currentTask, { contextKey: currentTask.contextKey })] };
    return null;
  }

  classifyError({ text = "", toolId = "", recoverable = false } = {}) {
    if (/permission|EACCES|EPERM|\u6743\u9650/i.test(text)) return "permission_denied";
    if (/exists|EEXIST|\u5df2\u5b58\u5728/i.test(text)) return "file_exists";
    if (/ENOENT|folder.*not.*exist|directory.*not.*exist|\u76ee\u5f55\u4e0d\u5b58\u5728|\u6587\u4ef6\u5939\u4e0d\u5b58\u5728/i.test(text)) return "missing_folder";
    if (toolId === "browser_open" && /edge|browser.*not.*found|\u6d4f\u89c8\u5668.*\u672a\u627e\u5230/i.test(text)) return "browser_missing";
    if (/not allowed|invalid path|\u8def\u5f84\u4e0d\u5728\u5141\u8bb8\u8303\u56f4|\u8def\u5f84\u65e0\u6548/i.test(text)) return "invalid_path";
    if (recoverable) return "recoverable";
    return "fatal";
  }

  solutionForRule(rule = "") {
    return {
      file_exists: "rename_file",
      missing_folder: "create_folder",
      browser_missing: "open_path",
      invalid_path: "use_workspace",
      recoverable: "retry"
    }[rule] || "abort";
  }
}

module.exports = { Replanner, DEFAULT_SAFE_ROOT };
