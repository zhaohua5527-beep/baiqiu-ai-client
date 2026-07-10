const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { openHtmlInRealBrowser, findBrowserExecutable } = require("../services/browser-open");

async function main() {
  const workspace = "D:\\BaiQiuAI\\data\\workspace\\tests";
  fs.mkdirSync(workspace, { recursive: true });
  const file = process.argv[2] || path.join(workspace, "白球计算器.html");
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, "<!doctype html><meta charset=\"utf-8\"><title>白球计算器</title><h1>白球计算器</h1>", "utf8");
  }
  const browser = findBrowserExecutable();
  const opened = await openHtmlInRealBrowser(file, { verifyDelayMs: 1500 });
  const ok = Boolean(browser && opened?.success && opened?.verifiedProcess && opened?.browserExe);
  console.log(JSON.stringify({ ok, file, browser, opened }, null, 2));
  if (!ok) process.exit(1);
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message || String(error) }, null, 2));
  process.exit(1);
});
