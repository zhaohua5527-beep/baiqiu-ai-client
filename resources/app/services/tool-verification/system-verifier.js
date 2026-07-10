const fs = require("node:fs");

function check(name, passed, detail = {}) {
  return { name, passed: Boolean(passed), detail };
}

function outputOf(result = {}) {
  const payload = result?.result && typeof result.result === "object" ? result.result : result;
  return payload?.output || payload?.result || payload;
}

function verifySystemShutdown({ result = {} } = {}) {
  const output = outputOf(result);
  const checks = [
    check("request_recorded", Boolean(output?.submitted || output?.scheduled || output?.dryRun), output),
    check("permission_path", Boolean(output?.permissionChecked !== false), output)
  ];
  const failed = checks.filter((item) => !item.passed);
  return {
    verified: failed.length === 0,
    status: failed.length === 0 ? "passed" : "failed",
    checks,
    reason: failed.length ? `system_shutdown 验证失败：${failed.map((item) => item.name).join(", ")}` : "system_shutdown 验证通过"
  };
}

function verifySkillInstall({ result = {} } = {}) {
  const output = outputOf(result);
  const skill = output?.skill || output;
  const skillsJson = output?.skillsJson || "";
  const fileOk = skillsJson ? fs.existsSync(skillsJson) : true;
  const installed = skill?.status === "installed";
  const failedState = skill?.status === "failed" || output?.status === "failed";
  const checks = [
    check("skill_record_present", Boolean(skill?.id || skill?.name), { skill }),
    check("skills_json_available", fileOk, { skillsJson }),
    check("status_final", installed || failedState, { status: skill?.status || output?.status || "" }),
    check("no_fake_success", output?.success !== true || installed, { success: output?.success, status: skill?.status })
  ];
  const failed = checks.filter((item) => !item.passed);
  return {
    verified: failed.length === 0,
    status: failed.length === 0 ? "passed" : "failed",
    checks,
    reason: failed.length ? `skill_install 验证失败：${failed.map((item) => item.name).join(", ")}` : "skill_install 验证通过"
  };
}

module.exports = { verifySystemShutdown, verifySkillInstall };
