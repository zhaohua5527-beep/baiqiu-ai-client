const https = require("node:https");

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDuckUrl(value) {
  const raw = decodeHtml(value);
  try {
    const parsed = new URL(raw, "https://duckduckgo.com");
    const uddg = parsed.searchParams.get("uddg");
    return uddg ? decodeURIComponent(uddg) : parsed.toString();
  } catch {
    return raw;
  }
}

function requestHtml(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 BaiqiuAI/0.1",
        "Accept": "text/html"
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirectCount < 3) {
        res.resume();
        requestHtml(new URL(res.headers.location, url).toString(), redirectCount + 1).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`搜索失败：HTTP ${res.statusCode}`));
        res.resume();
        return;
      }
      let html = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { html += chunk; });
      res.on("end", () => resolve(html));
    });
    req.setTimeout(12000, () => {
      req.destroy(new Error("搜索超时"));
    });
    req.on("error", reject);
  });
}

function requestDuckDuckGo(query) {
  return requestHtml(`https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`);
}

function requestBing(query) {
  return requestHtml(`https://www.bing.com/search?q=${encodeURIComponent(query)}`);
}

function parseDuckResults(html, maxResults) {
  const results = [];
  const itemRegex = /<div[^>]+class="[^"]*result[^"]*"[^>]*>([\s\S]*?)(?=<div[^>]+class="[^"]*result[^"]*"|<\/body>)/gi;
  let match;
  while ((match = itemRegex.exec(html)) && results.length < maxResults) {
    const block = match[1];
    const linkMatch = block.match(/<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!linkMatch) continue;
    const snippetMatch = block.match(/<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i)
      || block.match(/<div[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    const title = decodeHtml(linkMatch[2]);
    const url = normalizeDuckUrl(linkMatch[1]);
    const snippet = decodeHtml(snippetMatch?.[1] || "");
    if (title && url) results.push({ title, snippet, url });
  }
  return results;
}

function parseBingResults(html, maxResults) {
  const results = [];
  const itemRegex = /<li class="b_algo"[\s\S]*?<\/li>/gi;
  let match;
  while ((match = itemRegex.exec(html)) && results.length < maxResults) {
    const block = match[0];
    const linkMatch = block.match(/<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/h2>/i);
    if (!linkMatch) continue;
    const snippetMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    const title = decodeHtml(linkMatch[2]);
    const url = normalizeDuckUrl(linkMatch[1]);
    const snippet = decodeHtml(snippetMatch?.[1] || "");
    if (title && url) results.push({ title, snippet, url });
  }
  return results;
}

function createTool() {
  return {
    id: "web_search",
    name: "联网搜索",
    description: "根据关键词搜索网页内容，返回搜索结果摘要。用于学习网上流行技能前收集资料。",
    parameters: {
      type: "object",
      required: ["query"],
      properties: {
        query: { type: "string", description: "搜索关键词" },
        maxResults: { type: "number", description: "最大返回结果数，默认 5" }
      }
    },
    permission: { level: "network.read", scope: "web" },
    async execute(params) {
      const query = String(params.query || "").trim();
      const maxResults = Math.max(1, Math.min(10, Number(params.maxResults || 5)));
      if (!query) throw new Error("web_search 需要 query");
      let provider = "duckduckgo";
      let html = "";
      let result = [];
      try {
        html = await requestDuckDuckGo(query);
        result = parseDuckResults(html, maxResults);
      } catch (error) {
        provider = "bing";
        html = await requestBing(query);
        result = parseBingResults(html, maxResults);
      }
      return {
        success: true,
        result,
        error: null,
        evidence: [{ type: "web-search", provider, query, count: result.length }]
      };
    }
  };
}

module.exports = { createTool };
