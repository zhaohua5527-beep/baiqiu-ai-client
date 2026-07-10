const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { ProductSDK, UIAdapter, TaskExperience, UIStateManager, UI_STATES } = require("../services/product-sdk");

function tempDir(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `baiqiu-product-exp-${name}-`));
}

async function main() {
  const cases = [];
  const productRoot = path.join(__dirname, "..", "products", "desktop-assistant");

  {
    const task = { taskId: "task-1", message: "创建一个文件" };
    let experience = TaskExperience.create(task, "received");
    experience = TaskExperience.advance({ ...task, experience }, "understanding");
    experience = TaskExperience.advance({ ...task, experience }, "planning");
    experience = TaskExperience.advance({ ...task, experience }, "executing");
    experience = TaskExperience.advance({ ...task, experience }, "verifying");
    experience = TaskExperience.advance({ ...task, experience }, "completed");
    assert.equal(experience.status, "success");
    assert.equal(experience.progress, 100);
    assert.deepEqual(experience.timeline.map((item) => item.stage), [
      "received",
      "understanding",
      "planning",
      "executing",
      "verifying",
      "completed"
    ]);
    cases.push("task_experience_stage_flow");
  }

  {
    const uiState = new UIStateManager();
    const state = uiState.fromTaskExperience({ taskId: "task-2", currentStage: "executing", progress: 68, message: "正在执行" });
    assert.equal(state.state, UI_STATES.EXECUTING);
    assert.equal(state.history.length, 1);
    cases.push("ui_state_manager_maps_experience");
  }

  {
    const sdk = new ProductSDK({
      productRoot,
      dataRoot: tempDir("sdk"),
      adapter: {
        submit: async () => ({
          success: true,
          result: {
            normalized: { success: true, result: ["ok"], error: null },
            text: "完成",
            toolId: "demo_tool"
          }
        })
      }
    });
    const task = sdk.createTask({ message: "做一个任务" });
    sdk.updateTaskExperience(task.taskId, "understanding");
    const completed = await sdk.submitTask({ ...task, planObject: { id: "plan-1", primaryIntent: "demo", tasks: [{ id: "s1", toolId: "demo_tool" }] } });
    const stages = completed.experience.timeline.map((item) => item.stage);
    assert(stages.includes("received"));
    assert(stages.includes("understanding"));
    assert(stages.includes("executing"));
    assert(stages.includes("verifying"));
    assert(stages.includes("completed"));
    assert.equal(sdk.getTaskStatus(task.taskId).experience.currentStage, "completed");
    cases.push("product_sdk_status_sync");
  }

  {
    const ui = new UIAdapter({
      productRoot,
      dataRoot: tempDir("ui"),
      planBuilder: async () => ({
        id: "plan-ui",
        primaryIntent: "demo.intent",
        tasks: [{ id: "step-1", title: "演示任务", toolId: "demo_tool", executable: true }]
      }),
      taskOrchestrator: {
        execute: async () => ({
          success: true,
          normalized: { success: true, result: ["ok"], error: null },
          text: "UI 任务完成",
          toolId: "demo_tool"
        })
      }
    });
    const result = await ui.submitUIInput({ message: "执行 UI 任务" });
    assert.equal(result.success, true);
    assert.equal(result.experience.currentStage, "completed");
    assert(result.experience.timeline.some((item) => item.stage === "planning"));
    cases.push("ui_adapter_experience_result");
  }

  {
    const html = fs.readFileSync(path.join(__dirname, "..", "renderer", "index.html"), "utf8");
    const renderer = fs.readFileSync(path.join(__dirname, "..", "renderer", "app.js"), "utf8");
    assert(html.includes("productTimeline"), "developer timeline must exist");
    assert(renderer.includes("neuralDashboard.hidden = !devMode"), "developer dashboard must be devMode-gated");
    assert(!/EventBus|MemoryCenter|AgentManager|ToolExecutionService/.test(renderer), "client renderer must not expose internals");
    cases.push("client_developer_isolation");
  }

  {
    const productTemplate = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "products", "templates", "product-template.json"), "utf8"));
    const taskTemplate = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "products", "templates", "task-template.json"), "utf8"));
    assert(productTemplate.uiComponents.taskCard);
    assert(productTemplate.inputTypes);
    assert(taskTemplate.ui.progressStages.includes("executing"));
    cases.push("product_templates_include_ui_components");
  }

  console.log(JSON.stringify({ ok: true, cases }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
