const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const CONFIG_PATH = path.join(os.homedir(), ".openclaw", "openclaw.json");
const DEFAULT_GATEWAY = {
  gateway: {
    port: 18789,
    auth: { token: "baiqiu-local-gateway" }
  }
};

const CLOUD_MODEL_DEFAULTS = {
  deepseek: {
    name: "供应商2",
    baseURL: "https://codekey.buzz/keys",
    model: "deepseek-chat"
  }
};

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(DEFAULT_GATEWAY, null, 2), "utf8");
  }
  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(raw);
}

function getOpenClawConfig() {
  const config = readJson(CONFIG_PATH);
  const gateway = config.gateway || {};
  const port = gateway.port || 18789;
  const host = "127.0.0.1";
  const token = gateway.auth && gateway.auth.token;

  if (!token) {
    throw new Error(`Missing gateway.auth.token in ${CONFIG_PATH}`);
  }

  return {
    configPath: CONFIG_PATH,
    token,
    host,
    port,
    httpUrl: `http://${host}:${port}/`,
    dashboardUrl: `http://${host}:${port}/#token=${encodeURIComponent(token)}`,
    wsUrl: `ws://${host}:${port}`
  };
}

module.exports = { getOpenClawConfig, CLOUD_MODEL_DEFAULTS };

