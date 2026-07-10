const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { ProductSDK, ProductEventAdapter, UIAdapter } = require("../services/product-sdk");

function tempDir(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `baiqiu-product-${name}-`));
}

async function main() {
  const cases = [];
  const productRoot = path.join(__dirname, "..", "products", "desktop-assistant");
  const dataRoot = tempDir("data");

  {
    const manifest = JSON.parse(fs.readFileSync(path.join(productRoot, "product.json"), "utf8"));
    assert.equal(manifest.id, "desktop-assistant");
    assert(Array.isArray(manifest.capabilities));
    assert(Array.isArray(manifest.taskTemplates));
    cases.push("product_manifest_valid");
  }

  {
    const productFiles = [];
    function walk(dir) {
      for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, item.name);
        if (item.isDirectory()) walk(full);
        else productFiles.push(full);
      }
    }
    walk(path.join(__dirname, "..", "products"));
    const forbidden = productFiles
      .filter((file) => /\.(js|json)$/i.test(file))
      .filter((file) => /neural-core|ToolExecutionService|MemoryCenter|AgentEventBus/i.test(fs.readFileSync(file, "utf8")));
    assert.deepEqual(forbidden, []);
    cases.push("products_do_not_call_runtime_internals");
  }

  {
    const renderer = fs.readFileSync(path.join(__dirname, "..", "renderer", "app.js"), "utf8");
    const preload = fs.readFileSync(path.join(__dirname, "..", "preload.js"), "utf8");
    assert(!/api\.sendChat/.test(renderer), "renderer must not call chat:send directly");
    assert(!/sendChat:\s*\(/.test(preload), "preload must not expose sendChat to UI");
    assert(/productSubmitTask/.test(renderer), "renderer should submit through Product SDK");
    cases.push("ui_requests_go_through_product_sdk");
  }

  {
    const html = fs.readFileSync(path.join(__dirname, "..", "renderer", "index.html"), "utf8");
    const renderer = fs.readFileSync(path.join(__dirname, "..", "renderer", "app.js"), "utf8");
    assert(html.includes(`value="custom"`), "missing custom theme option");
    assert(html.includes(`value="black"`), "missing classic black theme option");
    assert(html.includes(`value="white"`), "missing classic white theme option");
    assert(html.includes(`id="skinImageInput"`), "missing custom skin image upload");
    assert(renderer.includes("skinImage"), "renderer should persist custom skin image");
    assert(renderer.includes("black:"), "missing classic black preset");
    assert(renderer.includes("white:"), "missing classic white preset");
    cases.push("theme_system_three_classics_with_custom_image");
  }

  {
    let orchestratorCalled = false;
    const adapter = new ProductEventAdapter({
      taskOrchestrator: {
        execute: async ({ planObject, contextPatch }) => {
          orchestratorCalled = true;
          assert.equal(contextPatch.productId, "desktop-assistant");
          assert.equal(planObject.primaryIntent, "product.demo");
          return {
            success: true,
            normalized: { success: true, result: ["ok"], error: null },
            text: "product task ok",
            toolId: "demo_tool"
          };
        }
      }
    });
    const sdk = new ProductSDK({ productRoot, dataRoot, adapter });
    const task = sdk.createTask({
      input: "demo",
      planObject: {
        id: "plan-product-demo",
        primaryIntent: "product.demo",
        tasks: [{ id: "step-1", toolId: "demo_tool", executable: true }]
      }
    });
    const completed = await sdk.submitTask(task);
    assert.equal(orchestratorCalled, true);
    assert.equal(completed.status, "success");
    assert.equal(sdk.getTaskStatus(task.taskId).status, "success");
    assert(sdk.getTaskResult(task.taskId));
    assert.equal(sdk.getTaskHistory({ productId: "desktop-assistant" }).length, 1);
    cases.push("product_sdk_calls_neural_core_dispatch");
  }

  {
    let planBuilt = false;
    let orchestratorCalled = false;
    const ui = new UIAdapter({
      productRoot,
      dataRoot: tempDir("ui-data"),
      planBuilder: async ({ message }) => {
        planBuilt = true;
        assert.equal(message, "帮我写一个计算器");
        return {
          id: "plan-ui-demo",
          primaryIntent: "dev.code.calculator",
          tasks: [{ id: "calculator", toolId: "calculator_creator", executable: true }]
        };
      },
      taskOrchestrator: {
        execute: async () => {
          orchestratorCalled = true;
          return {
            success: true,
            normalized: { success: true, result: ["calculator"], error: null },
            text: "计算器任务完成",
            toolId: "calculator_creator"
          };
        }
      }
    });
    const result = await ui.submitUIInput({ message: "帮我写一个计算器", productId: "desktop-assistant" });
    assert.equal(planBuilt, true);
    assert.equal(orchestratorCalled, true);
    assert.equal(result.success, true);
    assert.match(result.text, /计算器/);
    cases.push("ui_adapter_returns_ui_result");
  }

  console.log(JSON.stringify({ ok: true, cases }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
