const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

function readJson(filePath, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function updateState(stateFile, patch) {
  const current = readJson(stateFile, {});
  writeJson(stateFile, {
    ...current,
    ...patch,
    time: Date.now(),
    lastUpdate: Date.now()
  });
}

function runPowerShell(scriptPath) {
  const child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath], {
    detached: true,
    windowsHide: true,
    stdio: "ignore"
  });
  child.unref();
}

function main() {
  const scriptPath = process.argv[2];
  const stateFile = process.argv[3] || "";
  if (!scriptPath || !fs.existsSync(scriptPath)) {
    if (stateFile) updateState(stateFile, { state: "rollback", error: "update.ps1 missing" });
    process.exit(1);
  }
  if (stateFile) updateState(stateFile, { state: "switching", scriptPath });
  runPowerShell(scriptPath);
}

if (require.main === module) main();

module.exports = { readJson, writeJson, updateState };
