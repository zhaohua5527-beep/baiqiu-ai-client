const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createAndVerifyRequestedFiles, extractRequestedFileNames } = require("../services/verified-file-create");

const desktop = path.join(os.homedir(), "Desktop");
const message = "创建A.txt、B.txt、C.txt到桌面";
const targets = ["A.txt", "B.txt", "C.txt"].map((name) => path.join(desktop, name));

for (const file of targets) {
  fs.rmSync(file, { force: true });
}

const parsed = extractRequestedFileNames(message);
const result = createAndVerifyRequestedFiles({ message, targetRoot: desktop });
const verified = targets.map((file) => {
  const exists = fs.existsSync(file);
  const stat = exists ? fs.statSync(file) : null;
  return { file, exists, size: stat?.size || 0 };
});
const ok = parsed.length === 3 && verified.every((item) => item.exists && item.size > 0);

console.log(JSON.stringify({
  ok,
  desktop,
  message,
  parsed,
  written: result.written,
  verified
}, null, 2));

if (!ok) process.exit(1);
