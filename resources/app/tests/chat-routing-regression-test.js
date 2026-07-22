const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { AgentGuard } = require("../services/reliability/agent-guard");

let now = 1_000;
const guard = new AgentGuard({ maxExecutionMs: 120_000, clock: () => now });

guard.beginTask("same-session");
assert.equal(guard.beforeToolCall({ sessionId: "same-session", toolId: "web_search", args: { query: "weather" } }).allowed, true);

now += 121_000;
const longTask = guard.beforeToolCall({ sessionId: "same-session", toolId: "web_search", args: { query: "later" } });
assert.equal(longTask.allowed, true);
assert.equal(longTask.status, "running_long");

guard.beginTask("same-session");
const nextTask = guard.beforeToolCall({ sessionId: "same-session", toolId: "web_search", args: { query: "later" } });
assert.equal(nextTask.allowed, true);
assert.equal(nextTask.elapsed, 0);

const mainSource = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");
const strategiesSource = fs.readFileSync(path.join(__dirname, "..", "services", "agent-strategies", "index.js"), "utf8");
const toolExecutionSource = fs.readFileSync(path.join(__dirname, "..", "services", "tool-execution-service.js"), "utf8");
assert.doesNotMatch(mainSource, /今天具体对战国家/);
assert.doesNotMatch(mainSource, /webSearchFinalized/);
assert.match(mainSource, /web_search 已返回结果，继续交给模型整合为最终回复/);
assert.match(mainSource, /ensureAgentGuard\(\)\.beginTask\(session\.id\)/);
assert.match(mainSource, /模型供应商额度已用完或触发限流/);
assert.doesNotMatch(strategiesSource, /createRealtimeWebStrategy/);
assert.doesNotMatch(toolExecutionSource, /this\.withTimeout\(\s*this\.registry\.execute/);

console.log("chat routing regression tests passed");
