const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawn } = require("node:child_process");
const { pathToFileURL } = require("node:url");

const BROWSER_PROCESSES = ["msedge.exe", "chrome.exe", "firefox.exe", "brave.exe"];

function candidateBrowsers() {
  const programFiles = process.env.ProgramFiles || "C:\\Program Files";
  const programFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
  return [
    { name: "Microsoft Edge", exe: path.join(programFilesX86, "Microsoft", "Edge", "Application", "msedge.exe"), args: ["--new-window"] },
    { name: "Microsoft Edge", exe: path.join(programFiles, "Microsoft", "Edge", "Application", "msedge.exe"), args: ["--new-window"] },
    { name: "Google Chrome", exe: path.join(programFiles, "Google", "Chrome", "Application", "chrome.exe"), args: ["--new-window"] },
    { name: "Google Chrome", exe: path.join(programFilesX86, "Google", "Chrome", "Application", "chrome.exe"), args: ["--new-window"] },
    { name: "Google Chrome", exe: path.join(localAppData, "Google", "Chrome", "Application", "chrome.exe"), args: ["--new-window"] },
    { name: "Mozilla Firefox", exe: path.join(programFiles, "Mozilla Firefox", "firefox.exe"), args: ["--new-window"] },
    { name: "Mozilla Firefox", exe: path.join(programFilesX86, "Mozilla Firefox", "firefox.exe"), args: ["--new-window"] },
    { name: "Brave", exe: path.join(programFiles, "BraveSoftware", "Brave-Browser", "Application", "brave.exe"), args: ["--new-window"] }
  ];
}

function findBrowserExecutable() {
  const direct = candidateBrowsers().find((item) => fs.existsSync(item.exe));
  if (direct) return direct;
  for (const name of ["msedge.exe", "chrome.exe", "firefox.exe", "brave.exe"]) {
    try {
      const out = execFileSync("where.exe", [name], { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "ignore"] })
        .split(/\r?\n/)
        .map((item) => item.trim())
        .find(Boolean);
      if (out && fs.existsSync(out)) return { name: name.replace(/\.exe$/i, ""), exe: out, args: ["--new-window"] };
    } catch {}
  }
  return null;
}

function listBrowserProcesses() {
  try {
    const out = execFileSync("tasklist.exe", ["/FO", "CSV", "/NH"], { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
    return out
      .split(/\r?\n/)
      .map((line) => line.match(/^"([^"]+)"/)?.[1]?.toLowerCase())
      .filter(Boolean)
      .filter((name) => BROWSER_PROCESSES.includes(name));
  } catch {
    return [];
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function openHtmlInRealBrowser(file, options = {}) {
  const resolved = path.resolve(file);
  if (!fs.existsSync(resolved)) throw new Error(`HTML 文件不存在：${resolved}`);
  const stat = fs.statSync(resolved);
  if (!stat.isFile()) throw new Error(`HTML 路径不是文件：${resolved}`);
  const browser = findBrowserExecutable();
  if (!browser) throw new Error("没有找到可用浏览器，请安装 Microsoft Edge 或 Chrome。");

  const before = new Set(listBrowserProcesses());
  const url = pathToFileURL(resolved).href;
  const child = spawn(browser.exe, [...(browser.args || []), url], {
    detached: true,
    stdio: "ignore",
    windowsHide: false
  });
  child.unref?.();
  await wait(Math.max(300, Number(options.verifyDelayMs) || 1200));
  const after = new Set(listBrowserProcesses());
  const processName = path.basename(browser.exe).toLowerCase();
  const processVisible = after.has(processName) || after.size > before.size || before.has(processName);
  if (!processVisible) throw new Error(`浏览器启动后未检测到进程：${browser.name}`);
  return {
    success: true,
    file: resolved,
    url,
    browser: browser.name,
    browserExe: browser.exe,
    processName,
    verifiedProcess: processVisible
  };
}

module.exports = {
  findBrowserExecutable,
  listBrowserProcesses,
  openHtmlInRealBrowser
};
