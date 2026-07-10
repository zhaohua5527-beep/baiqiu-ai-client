const fs = require("node:fs");
const path = require("node:path");

function loadTools(registry, context, toolsDir = path.join(__dirname, "tools")) {
  if (!fs.existsSync(toolsDir)) return [];
  const registered = [];
  const files = fs.readdirSync(toolsDir)
    .filter((file) => file.endsWith(".js"))
    .sort();

  for (const file of files) {
    const fullPath = path.join(toolsDir, file);
    delete require.cache[require.resolve(fullPath)];
    const mod = require(fullPath);
    const exportsValue = typeof mod.createTools === "function"
      ? mod.createTools(context)
      : typeof mod.createTool === "function"
        ? mod.createTool(context)
        : mod.tools || mod.tool || mod;
    const tools = Array.isArray(exportsValue) ? exportsValue : [exportsValue];
    for (const tool of tools.filter(Boolean)) {
      registered.push(registry.register(tool));
    }
  }
  return registered;
}

module.exports = { loadTools };
