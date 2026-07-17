const assert = require("node:assert/strict");
const { listProviderModels, callChatCompletion } = require("../services/model-adapter");

function response(status, payload) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => payload
  };
}

async function main() {
  let listRequest = null;
  const listed = await listProviderModels({
    providerId: "openai",
    provider: { apiKey: "test-key", baseURL: "https://api.openai.com/v1", model: "gpt-5.6-sol" },
    fetchImpl: async (url, options) => {
      listRequest = { url, options };
      return response(200, { data: [{ id: "gpt-5.6-terra" }, { id: "gpt-5.6-sol" }] });
    }
  });
  assert.equal(listRequest.url, "https://api.openai.com/v1/models");
  assert.equal(listRequest.options.headers.Authorization, "Bearer test-key");
  assert.deepEqual(listed.models, ["gpt-5.6-sol", "gpt-5.6-terra"]);

  let chatRequest = null;
  const chat = await callChatCompletion({
    providerId: "openai",
    provider: { apiKey: "test-key", baseURL: "https://api.openai.com/v1/chat/completions", model: "gpt-5.6-sol" },
    body: { model: "gpt-5.6-sol", messages: [{ role: "user", content: "hello" }] },
    fetchImpl: async (url, options) => {
      chatRequest = { url, body: JSON.parse(options.body) };
      return response(200, { choices: [{ message: { role: "assistant", content: "ok" } }] });
    }
  });
  assert.equal(chatRequest.url, "https://api.openai.com/v1/chat/completions");
  assert.equal(chatRequest.body.model, "gpt-5.6-sol");
  assert.equal(chat.choices[0].message.content, "ok");

  let anthropicRequest = null;
  const anthropic = await callChatCompletion({
    providerId: "anthropic",
    provider: { apiKey: "test-key", baseURL: "https://api.anthropic.com/v1", model: "claude-test", apiStyle: "anthropic" },
    body: {
      messages: [{ role: "system", content: "system" }, { role: "user", content: "hello" }],
      tools: [{ type: "function", function: { name: "lookup", description: "Lookup", parameters: { type: "object" } } }]
    },
    fetchImpl: async (url, options) => {
      anthropicRequest = { url, headers: options.headers, body: JSON.parse(options.body) };
      return response(200, { content: [{ type: "text", text: "done" }] });
    }
  });
  assert.equal(anthropicRequest.url, "https://api.anthropic.com/v1/messages");
  assert.equal(anthropicRequest.headers["x-api-key"], "test-key");
  assert.equal(anthropicRequest.body.tools[0].name, "lookup");
  assert.equal(anthropic.choices[0].message.content, "done");

  console.log("model-adapter-test: PASS");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
