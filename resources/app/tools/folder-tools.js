const fs = require("node:fs");
const path = require("node:path");

const WORKSPACE_ROOT = path.join("D:\\BaiQiuAI", "data", "workspace");

function cleanName(value = "") {
  return String(value || "新建文件夹")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/\s+/g, "")
    .slice(0, 80) || "新建文件夹";
}

function resolveFolder(params = {}) {
  const name = cleanName(params.name || params.folderName || "白球文件夹");
  const rawPath = String(params.path || "").trim();
  const root = WORKSPACE_ROOT;
  fs.mkdirSync(root, { recursive: true });
  if (!rawPath) return path.join(root, name);
  if (/^desktop[\\/]/i.test(rawPath)) {
    const desktop = path.join(process.env.USERPROFILE || root, "Desktop");
    return path.join(desktop, rawPath.replace(/^desktop[\\/]/i, ""));
  }
  if (path.isAbsolute(rawPath)) return path.resolve(rawPath);
  return path.join(root, rawPath);
}

function createTools() {
  return [
    {
      id: "create_folder",
      name: "创建文件夹",
      description: "在白球允许的工作区内真实创建文件夹，并返回目录路径。",
      category: "file",
      supportedIntent: ["file.create", "system.open"],
      riskLevel: "low",
      requirePermission: false,
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          name: { type: "string" }
        }
      },
      permission: { level: "filesystem.write", scope: "app.desktop.saveLocation" },
      async execute(params = {}) {
        const folder = resolveFolder(params);
        fs.mkdirSync(folder, { recursive: true });
        const stat = fs.statSync(folder);
        return {
          success: stat.isDirectory(),
          result: {
            success: stat.isDirectory(),
            path: folder,
            folder,
            created: true
          },
          error: null,
          evidence: [{ type: "folder", tool: "create_folder", path: folder }]
        };
      }
    }
  ];
}

module.exports = { createTools, resolveFolder };
