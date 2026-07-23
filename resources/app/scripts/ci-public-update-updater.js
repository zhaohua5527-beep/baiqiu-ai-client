"use strict";

const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");

const [zipFile, extractedClientRoot, testRoot] = process.argv.slice(2);
if (!zipFile || !extractedClientRoot || !testRoot) {
  throw new Error("Usage: node ci-public-update-updater.js <zip> <client-root> <test-root>");
}

const installRoot = path.join(testRoot, "install");
const userDataPath = path.join(testRoot, "user-data");
const appRoot = path.join(installRoot, "resources", "app");
fs.mkdirSync(appRoot, { recursive: true });
fs.mkdirSync(userDataPath, { recursive: true });
fs.writeFileSync(path.join(installRoot, "BaiqiuAI.exe"), "synthetic-old-executable-2.1.0", "utf8");
fs.writeFileSync(path.join(installRoot, "obsolete-runtime.dll"), "must-be-removed", "utf8");
fs.writeFileSync(path.join(appRoot, "main.js"), "module.exports = 'old';\n", "utf8");
fs.writeFileSync(path.join(appRoot, "package.json"), JSON.stringify({ name: "baiqiu-old", version: "2.1.0", main: "main.js" }), "utf8");
fs.writeFileSync(path.join(appRoot, "version.json"), JSON.stringify({ appVersion: "2.1.0" }), "utf8");
fs.writeFileSync(path.join(userDataPath, "keep-me.txt"), "preserved-user-data", "utf8");

const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === "electron") {
    return {
      app: {
        getVersion: () => "2.1.0",
        getPath: (name) => name === "exe" ? path.join(installRoot, "BaiqiuAI.exe") : userDataPath
      }
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};
const Updater = require(path.join(extractedClientRoot, "resources", "app", "services", "updater.js"));
Module._load = originalLoad;

(async () => {
  const updater = new Updater({
    currentVersion: "2.1.0",
    downloadDir: path.join(userDataPath, "updates"),
    statePath: path.join(userDataPath, "updates", "update-state.json"),
    updateLogPath: path.join(userDataPath, "logs", "update.log"),
    executablePath: path.join(installRoot, "BaiqiuAI.exe"),
    userDataPath,
    processId: 0
  });
  const prepared = await updater.applyUpdate(zipFile, { version: "2.1.1", oldVersion: "2.1.0" });
  process.stdout.write(JSON.stringify({ ...prepared, installRoot, userDataPath }));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
