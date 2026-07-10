const { createHash, randomUUID } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const os = require("node:os");

const OWNER_HASH = "874e2a8c0586b965c7e3bbaff8fe5fab90de6a68058a772e3982676d317de96e";
const INVITE_SECRET = "baiqiu-ai-owner-signed-invite-v2";

function machineUuid() {
  try {
    return String(execFileSync("powershell.exe", ["-NoProfile", "-Command", "(Get-CimInstance Win32_ComputerSystemProduct).UUID"], {
      windowsHide: true,
      timeout: 3000
    })).trim();
  } catch {
    return "";
  }
}

function ownerFingerprint() {
  return createHash("sha256")
    .update(`${os.userInfo().username}|${os.hostname()}|${machineUuid()}`.toUpperCase())
    .digest("hex");
}

if (ownerFingerprint() !== OWNER_HASH) {
  console.error("当前设备没有邀请码生成权限。");
  process.exit(1);
}

const count = Math.max(1, Math.min(50, Number(process.argv[2] || 1)));

function digest(value) {
  return createHash("sha256").update(`${INVITE_SECRET}:${value}`).digest("hex").slice(0, 4).toUpperCase();
}

for (let i = 0; i < count; i += 1) {
  const payload = randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
  const code = `BQ-${payload.slice(0, 4)}-${payload.slice(4, 8)}-${digest(`BAIQIU-${payload}`)}`;
  console.log(code);
}
