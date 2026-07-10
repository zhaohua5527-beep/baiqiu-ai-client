const fs = require("node:fs");

function check(name, passed, detail = {}) {
  return { name, passed: Boolean(passed), detail };
}

function verifyCreateFolder({ result = {} } = {}) {
  const payload = result?.result && typeof result.result === "object" ? result.result : result;
  const output = payload?.output || payload?.result || payload;
  const folder = output?.path || output?.folder || "";
  const exists = Boolean(folder && fs.existsSync(folder));
  const stat = exists ? fs.statSync(folder) : null;
  const checks = [
    check("path_present", Boolean(folder), { path: folder }),
    check("folder_exists", Boolean(exists && stat?.isDirectory()), { path: folder })
  ];
  const failed = checks.filter((item) => !item.passed);
  return {
    verified: failed.length === 0,
    status: failed.length === 0 ? "passed" : "failed",
    checks,
    reason: failed.length ? `create_folder 验证失败：${failed.map((item) => item.name).join(", ")}` : "create_folder 验证通过"
  };
}

module.exports = { verifyCreateFolder };
