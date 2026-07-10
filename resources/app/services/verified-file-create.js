const fs = require("node:fs");
const path = require("node:path");

function sanitizeText(value) {
  return String(value ?? "").replace(/\u0000/g, "").trim();
}

function sanitizeRequestedFileName(name) {
  const value = sanitizeText(name)
    .replace(/^(?:请|帮我|帮我们|给我|给我们|我要|需要|创建|新建|生成|写入|写|做|制作|保存|放到|放桌面)+/i, "")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/^\.+/, "")
    .trim();
  if (!value || value.length > 120) return "";
  return value;
}

function extractRequestedFileNames(message) {
  const text = String(message || "");
  const found = [];
  const seen = new Set();
  const re = /([A-Za-z0-9_\-\u4e00-\u9fa5]+)\.(txt|md|json|csv|html|js|py)\b/gi;
  let match;
  while ((match = re.exec(text))) {
    const name = sanitizeRequestedFileName(`${match[1]}.${match[2].toLowerCase()}`);
    const key = name.toLowerCase();
    if (name && !seen.has(key)) {
      seen.add(key);
      found.push(name);
    }
  }
  return found.slice(0, 20);
}

function defaultContentForRequestedFile(fileName, message) {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === ".json") return JSON.stringify({ createdBy: "白球AI", fileName, request: sanitizeText(message), createdAt: new Date().toISOString() }, null, 2);
  if (ext === ".csv") return "文件名,创建者,创建时间\n" + `${fileName},白球AI,${new Date().toISOString()}\n`;
  if (ext === ".html") return `<!doctype html><meta charset="utf-8"><title>${fileName}</title><h1>${fileName}</h1><p>由白球AI创建。</p>`;
  if (ext === ".js") return `console.log("${fileName} created by Baiqiu AI");\n`;
  if (ext === ".py") return `print("${fileName} created by Baiqiu AI")\n`;
  return `由白球AI创建：${fileName}\n创建时间：${new Date().toLocaleString("zh-CN", { hour12: false })}\n用户请求：${sanitizeText(message)}\n`;
}

function createAndVerifyRequestedFiles({ message, targetRoot, signal = null }) {
  const names = extractRequestedFileNames(message);
  if (!names.length) {
    const error = new Error("没有识别到要创建的文件名。");
    error.code = "NO_FILE_NAMES";
    throw error;
  }
  const root = path.resolve(targetRoot);
  fs.mkdirSync(root, { recursive: true });
  const written = [];
  for (const name of names) {
    if (signal?.aborted) {
      const error = new Error("任务已被用户终止。");
      error.code = "TASK_CANCELLED";
      throw error;
    }
    const file = path.join(root, name);
    fs.writeFileSync(file, defaultContentForRequestedFile(path.basename(file), message), "utf8");
    written.push(file);
  }
  const verified = written.map((file) => {
    if (!fs.existsSync(file)) throw new Error(`文件不存在：${file}`);
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size < 1) throw new Error(`文件校验失败：${file}`);
    return { file, name: path.basename(file), size: stat.size };
  });
  return { names, written, verified };
}

module.exports = {
  extractRequestedFileNames,
  defaultContentForRequestedFile,
  createAndVerifyRequestedFiles
};
