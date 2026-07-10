const path = require("node:path");
const { createProductSDK } = require("../../services/product-sdk");

function createDesktopAssistantDemo({ taskOrchestrator, dataRoot } = {}) {
  return createProductSDK({
    productRoot: __dirname,
    dataRoot
  });
}

async function runDemo({ sdk = null, input = "帮我写一个计算器", planObject = null } = {}) {
  const productSdk = sdk || createProductSDK({ productRoot: __dirname });
  const task = productSdk.createTask({
    templateId: "desktop.general_task",
    input,
    message: input,
    intent: planObject?.primaryIntent || "",
    planObject,
    context: {
      product: "desktop-assistant"
    }
  });
  return productSdk.submitTask(task);
}

module.exports = { createDesktopAssistantDemo, runDemo, productRoot: __dirname, productJson: path.join(__dirname, "product.json") };
