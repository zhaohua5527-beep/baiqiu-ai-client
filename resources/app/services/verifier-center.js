const fs = require("node:fs");
const { verifyCreateFolder } = require("./tool-verification/folder-verifier");
const { verifySystemShutdown, verifySkillInstall } = require("./tool-verification/system-verifier");

function metric(name, data) {
  try { require("./neural-core/agent-event-bus").recordRuntimeMetric?.(name, data); } catch {}
}

function check(name, passed, detail = {}) {
  return { name, passed: Boolean(passed), detail };
}

function pickPayload(result = {}) {
  const outer = result?.result && typeof result.result === "object" ? result.result : result;
  const output = outer?.output && typeof outer.output === "object" ? outer.output : outer?.result;
  return {
    outer,
    output: output && typeof output === "object" ? output : outer
  };
}

function verifyFileExists(file) {
  const exists = Boolean(file && fs.existsSync(file));
  const stat = exists ? fs.statSync(file) : null;
  return { exists, stat };
}

function verifyCalculator({ result }) {
  const { output } = pickPayload(result);
  const file = output?.file;
  const { exists, stat } = verifyFileExists(file);
  const content = exists ? fs.readFileSync(file, "utf8") : "";
  const checks = [
    check("file_exists", exists, { file }),
    check("file_size", Boolean(stat?.isFile() && stat.size >= 1000), { size: stat?.size || 0 }),
    check("content_check", ["+", "-", "*", "/", "%", "keydown", "__baiqiuCalculatorTest"].every((token) => content.includes(token))),
    check("browser_open", Boolean(output?.opened || output?.openUrl || output?.browserVerified), {
      browser: output?.browser || "",
      browserVerified: Boolean(output?.browserVerified)
    })
  ];
  return verdict(checks, "calculator_creator");
}

function verifyHtmlApp({ result }) {
  const { output } = pickPayload(result);
  const file = output?.file;
  const { exists, stat } = verifyFileExists(file);
  const content = exists ? fs.readFileSync(file, "utf8") : "";
  const opened = output?.opened || {};
  const checks = [
    check("file_exists", exists, { file }),
    check("file_size", Boolean(stat?.isFile() && stat.size >= 1200), { size: stat?.size || 0 }),
    check("html_script", /<script[\s>]/i.test(content)),
    check("browser_open", Boolean(opened?.url || opened?.verifiedProcess || output?.openUrl), {
      browser: opened?.browser || output?.browser || "",
      browserVerified: Boolean(opened?.verifiedProcess || output?.browserVerified)
    })
  ];
  return verdict(checks, "html_app_creator");
}

function verifyFileCreator({ result }) {
  const { output } = pickPayload(result);
  const files = Array.isArray(output?.files) ? output.files : [];
  const checks = [
    check("files_present", files.length > 0, { count: files.length }),
    ...files.map((item, index) => {
      const file = item?.file;
      const { exists, stat } = verifyFileExists(file);
      return check(`file_${index + 1}_exists`, Boolean(exists && stat?.isFile() && stat.size > 0), {
        file,
        size: stat?.size || 0
      });
    })
  ];
  return verdict(checks, "file_creator");
}

function verifyBrowserOpen({ result }) {
  const { output } = pickPayload(result);
  const checks = [
    check("target_present", Boolean(output?.url || output?.target || output?.file), {
      url: output?.url || "",
      target: output?.target || "",
      file: output?.file || ""
    }),
    check("browser_open", Boolean(output?.verifiedProcess || output?.opened || output?.url), {
      browser: output?.browser || "",
      verifiedProcess: Boolean(output?.verifiedProcess)
    })
  ];
  return verdict(checks, "browser_open");
}

function verdict(checks, toolId) {
  const failed = checks.filter((item) => !item.passed);
  return {
    verified: failed.length === 0,
    status: failed.length === 0 ? "passed" : "failed",
    checks,
    reason: failed.length ? `${toolId} 验证失败：${failed.map((item) => item.name).join(", ")}` : `${toolId} 验证通过`
  };
}

class VerifierCenter {
  constructor({ logger = null, verifiers = null } = {}) {
    this.logger = typeof logger === "function" ? logger : null;
    this.verifiers = new Map(Object.entries(verifiers || {
      calculator_creator: verifyCalculator,
      html_app_creator: verifyHtmlApp,
      file_creator: verifyFileCreator,
      browser_open: verifyBrowserOpen,
      create_folder: verifyCreateFolder,
      system_shutdown: verifySystemShutdown,
      skill_install: verifySkillInstall
    }));
  }

  register(toolId, verifier) {
    if (!toolId || typeof verifier !== "function") throw new Error("Verifier registration requires toolId and verifier");
    this.verifiers.set(String(toolId), verifier);
  }

  verify({ toolId = "", result = {}, context = {} } = {}) {
    const startedAt = Date.now();
    const id = String(toolId || "");
    const verifier = this.verifiers.get(id);
    if (!verifier) {
      const skipped = this.trace(id, {
        verified: true,
        status: "skipped",
        checks: [],
        reason: "该工具未配置专用验证器，跳过统一验证"
      });
      metric("VerifierCenter", { duration: Date.now() - startedAt, success: true });
      return skipped;
    }
    try {
      const output = verifier({ toolId: id, result, context });
      metric("VerifierCenter", { duration: Date.now() - startedAt, success: output?.verified !== false });
      return this.trace(id, output);
    } catch (error) {
      const failed = this.trace(id, {
        verified: false,
        status: "failed",
        checks: [check("verifier_exception", false, { message: error?.message || String(error) })],
        reason: error?.message || String(error)
      });
      metric("VerifierCenter", { duration: Date.now() - startedAt, success: false });
      return failed;
    }
  }

  trace(toolId, verification) {
    this.logger?.("agent", verification.verified ? "INFO" : "WARN", "[VerifierCenter]", {
      tool: toolId,
      verification: verification.status,
      checks: verification.checks,
      reason: verification.reason
    });
    return verification;
  }
}

module.exports = { VerifierCenter };
