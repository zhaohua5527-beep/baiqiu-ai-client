const fs = require("node:fs");
const path = require("node:path");

function copyDir(source, target) {
  if (!fs.existsSync(source)) throw new Error(`Backup not found: ${source}`);
  fs.mkdirSync(target, { recursive: true });
  fs.cpSync(source, target, { recursive: true, force: true });
}

function main() {
  const backupPath = process.argv[2];
  const targetPath = process.argv[3];
  const stateFile = process.argv[4];
  copyDir(backupPath, targetPath);
  if (stateFile) {
    fs.writeFileSync(stateFile, JSON.stringify({
      state: "rollback",
      backupPath,
      appPath: targetPath,
      time: Date.now(),
      lastUpdate: Date.now(),
      error: ""
    }, null, 2), "utf8");
  }
}

if (require.main === module) main();
