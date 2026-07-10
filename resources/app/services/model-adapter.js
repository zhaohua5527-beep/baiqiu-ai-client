const PRESET_PROVIDERS = {
  deepseek: { name: "供应商2", baseURL: "https://codekey.buzz/keys", model: "deepseek-chat", apiStyle: "openai", requiresApiKey: true },
  openai: { name: "GPT", baseURL: "https://api.openai.com/v1", model: "gpt-4.1", apiStyle: "openai", requiresApiKey: true },
  kimi: { name: "Kimi", baseURL: "https://api.moonshot.cn/v1", model: "moonshot-v1-128k", apiStyle: "openai", requiresApiKey: true },
  anthropic: { name: "Claude", baseURL: "https://api.anthropic.com/v1", model: "claude-3-5-sonnet-latest", apiStyle: "anthropic", requiresApiKey: true },
  qwen: { name: "通义千问", baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-plus", apiStyle: "openai", requiresApiKey: true },
  baidu: { name: "文心一言", baseURL: "https://qianfan.baidubce.com/v2", model: "ernie-4.0-turbo-8k", apiStyle: "openai", requiresApiKey: true },
  zhipu: { name: "智谱清言", baseURL: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4-plus", apiStyle: "openai", requiresApiKey: true },
  ollama: { name: "Ollama 本地", baseURL: "http://localhost:11434/v1", model: "qwen2.5:7b", apiStyle: "openai", requiresApiKey: false, local: true }
};

function normalizeProvider(id, provider = {}) {
  const preset = PRESET_PROVIDERS[id] || {};
  return {
    id,
    ...preset,
    ...provider,
    name: provider.name || preset.name || id,
    baseURL: String(provider.baseURL || preset.baseURL || "").replace(/\/+$/, ""),
    model: provider.model || preset.model || "",
    apiStyle: provider.apiStyle || preset.apiStyle || "openai",
    requiresApiKey: provider.requiresApiKey !== undefined ? Boolean(provider.requiresApiKey) : preset.requiresApiKey !== false,
    local: Boolean(provider.local || preset.local)
  };
}

async function callChatCompletion({ providerId, provider, body, fetchImpl = fetch, signal = null }) {
  const normalized = normalizeProvider(providerId, provider);
  if (!normalized.baseURL) throw new Error(`模型 ${normalized.name} 缺少 Base URL`);
  if (normalized.requiresApiKey && !normalized.apiKey) throw new Error(`请先在设置中填写 ${normalized.name} 的 API Key。`);
  if (normalized.apiStyle !== "openai") throw new Error(`当前版本暂未启用 ${normalized.name} 的专用协议，请先使用 OpenAI 兼容接口。`);

  const url = `${normalized.baseURL}/chat/completions`;
  const headers = { "Content-Type": "application/json" };
  if (normalized.apiKey) headers.Authorization = `Bearer ${normalized.apiKey}`;
  const startedAt = Date.now();
  const requestModel = body.model || normalized.model;
  console.log(`[ModelAdapter] ${normalized.local ? "本地" : "云端"}模型调用: provider=${normalized.name}, baseURL=${normalized.baseURL}, model=${requestModel}`);
  const response = await fetchImpl(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ ...body, model: requestModel }),
    signal: signal || undefined
  });
  const payload = await response.json().catch(() => ({}));
  payload._debug = {
    providerId,
    providerName: normalized.name,
    model: requestModel,
    baseURL: normalized.baseURL,
    url,
    local: Boolean(normalized.local),
    status: response.status,
    ok: response.ok,
    durationMs: Date.now() - startedAt,
    usage: payload.usage || null,
    sentAt: startedAt,
    receivedAt: Date.now()
  };
  if (!response.ok) throw new Error(payload.error?.message || payload.message || `HTTP ${response.status}`);
  const hasOpenAiChoice = Array.isArray(payload.choices) && payload.choices.length > 0;
  const hasResponsesText = typeof payload.output_text === "string" && payload.output_text.length > 0;
  if (!hasOpenAiChoice && !hasResponsesText) {
    const error = new Error("模型接口已返回，但响应中没有可用的回复内容。请检查 Base URL 是否为 OpenAI 兼容 chat/completions 地址。");
    error.debug = payload._debug;
    throw error;
  }
  return payload;
}

module.exports = { PRESET_PROVIDERS, normalizeProvider, callChatCompletion };
