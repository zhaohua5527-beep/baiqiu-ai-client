const os = require("node:os");
const path = require("node:path");

function dataRoot() {
  const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  return process.env.BAIQIU_DATA_ROOT || path.join(appData, "Baiqiu AI", "data");
}

module.exports = { dataRoot };
