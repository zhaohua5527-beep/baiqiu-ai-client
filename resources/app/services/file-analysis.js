const fs = require("node:fs");
const path = require("node:path");

const ANALYSIS_EXTENSIONS = new Set([
  ".xlsx", ".xls", ".csv",
  ".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif",
  ".txt", ".md", ".json"
]);

const MIME_TYPES = {
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.ms-excel",
  ".csv": "text/csv",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".gif": "image/gif",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".json": "application/json"
};

function sanitizeText(text) {
  return String(text || "").replace(/\u0000/g, "").replace(/[\u0001-\u001F\u007F]/g, "").trim();
}

function isSupportedFile(file) {
  return ANALYSIS_EXTENSIONS.has(path.extname(String(file || "")).toLowerCase());
}

function fileMimeType(file) {
  return MIME_TYPES[path.extname(file).toLowerCase()] || "application/octet-stream";
}

function normalizeCandidate(raw) {
  return sanitizeText(raw)
    .replace(/^[\s"'“”‘’`<>【】\[\](){}，。；;：:、|]+/, "")
    .replace(/[\s"'“”‘’`<>【】\[\](){}，。；;：:、|]+$/, "")
    .replace(/^(请|帮我|麻烦你|白球|小白|分析|读取|打开|查看|看看|识别|总结|这个|这份|这个文件|这张图|这张图片|这个表格)\s*/i, "")
    .trim();
}

function extractFileReferences(message = "") {
  const text = String(message || "");
  const refs = [];
  const seen = new Set();

  const quoted = text.match(/["“'‘]([^"”'’]+\.(?:xlsx|xls|csv|png|jpe?g|webp|bmp|gif|txt|md|json))["”'’]/gi) || [];
  for (const item of quoted) {
    const value = normalizeCandidate(item.replace(/^["“'‘]|["”'’]$/g, ""));
    const key = value.toLowerCase();
    if (value && isSupportedFile(value) && !seen.has(key)) {
      seen.add(key);
      refs.push(value);
    }
  }

  const pattern = /(?:[A-Za-z]:[\\/][^\r\n"'<>|]+?|[^\s\r\n"'<>|，。；;：:]+?)\.(?:xlsx|xls|csv|png|jpe?g|webp|bmp|gif|txt|md|json)(?![A-Za-z0-9])/gi;
  let match;
  while ((match = pattern.exec(text))) {
    const value = normalizeCandidate(match[0]);
    const key = value.toLowerCase();
    if (value && isSupportedFile(value) && !seen.has(key)) {
      seen.add(key);
      refs.push(value);
    }
  }
  return refs.slice(0, 10);
}

function isAnalysisIntent(message = "") {
  const text = sanitizeText(message);
  if (!text) return false;
  return /(分析|读取|读一下|查看|看看|识别|总结|解释|这个文件|这份文件|这个表格|这张图|图片|照片|图像|表格|excel|xlsx|csv|json|文档|文件)/i.test(text);
}

function isContinuationIntent(message = "") {
  const text = sanitizeText(message).replace(/\s+/g, "");
  if (!text) return false;
  return /^(继续|继续分析|接着分析|再分析|再看看|再看一下|这个呢|这个有什么问题|有什么问题|哪里异常|总结一下|给建议|分析它|看这个|读这个|分析这个|表格分析|图片分析|文件分析)$/i.test(text);
}

function safeStat(file) {
  try {
    return fs.statSync(file);
  } catch {
    return null;
  }
}

function walkForFile(root, wantedNames, limit = 12000) {
  const hits = [];
  const stack = [root];
  let seen = 0;
  while (stack.length && seen < limit) {
    const dir = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      seen += 1;
      if (seen >= limit) break;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (/^(node_modules|\.git|dist|build|cache|code cache|appdata)$/i.test(entry.name)) continue;
        stack.push(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (wantedNames.has(entry.name.toLowerCase()) && isSupportedFile(entry.name)) hits.push(full);
    }
  }
  return hits;
}

function resolveReferences(references = [], searchRoots = []) {
  const resolved = [];
  const seen = new Set();
  for (const ref of references) {
    const direct = path.isAbsolute(ref) ? path.resolve(ref) : "";
    if (direct && fs.existsSync(direct) && isSupportedFile(direct)) {
      const key = direct.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        resolved.push(direct);
      }
      continue;
    }

    const wanted = path.basename(ref).toLowerCase();
    if (!wanted || !isSupportedFile(wanted)) continue;
    for (const root of searchRoots) {
      if (!root || !fs.existsSync(root)) continue;
      for (const hit of walkForFile(root, new Set([wanted]))) {
        const key = hit.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          resolved.push(hit);
        }
      }
      if (resolved.some((file) => path.basename(file).toLowerCase() === wanted)) break;
    }
  }
  return resolved.slice(0, 6);
}

function textContentFromFile(file, mimeType) {
  if (!/\.(txt|md|json|csv)$/i.test(file)) return "";
  try {
    return fs.readFileSync(file, "utf8").slice(0, 120000);
  } catch {
    return "";
  }
}

function attachmentFromFile(file) {
  const stat = safeStat(file);
  if (!stat?.isFile()) return null;
  const mimeType = fileMimeType(file);
  const data = fs.readFileSync(file);
  return {
    id: `local-file-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: path.basename(file),
    mimeType,
    sizeBytes: stat.size,
    dataUrl: `data:${mimeType};base64,${data.toString("base64")}`,
    textContent: textContentFromFile(file, mimeType),
    sourcePath: file
  };
}

function targetFromAttachment(attachment = {}) {
  if (!attachment?.name) return null;
  const ext = path.extname(attachment.name).toLowerCase();
  if (!ANALYSIS_EXTENSIONS.has(ext)) return null;
  return {
    path: attachment.sourcePath || attachment.path || "",
    name: attachment.name,
    mimeType: attachment.mimeType || fileMimeType(attachment.name),
    ext
  };
}

function analysisHint({ targets = [], usedLastTarget = false } = {}) {
  const names = targets.map((item) => item.name).filter(Boolean);
  if (!names.length) return "";
  const source = usedLastTarget ? "继续基于上一份文件/图片" : "请直接分析以下附件";
  return [
    `${source}：${names.join("、")}。`,
    "如果是表格，请基于表格数据给出结论、异常点和下一步建议。",
    "如果是图片，请基于图片内容或当前模型可获得的信息进行分析；不要假装看到了未提供的信息。",
    "如果是文本/JSON，请提炼关键信息、风险点和可执行建议。"
  ].join("\n");
}

function prepareAnalysisContext({ message, attachments = [], lastTarget, searchRoots = [] } = {}) {
  const refs = extractFileReferences(message);
  const attachedTargets = attachments.map(targetFromAttachment).filter(Boolean);
  const useLast = Boolean(isContinuationIntent(message) && lastTarget?.path && fs.existsSync(lastTarget.path) && isSupportedFile(lastTarget.path));
  const shouldResolve = isAnalysisIntent(message) || refs.length > 0 || attachedTargets.length > 0 || useLast;
  const resolvedFiles = shouldResolve ? resolveReferences(refs, searchRoots) : [];
  if (useLast) resolvedFiles.unshift(lastTarget.path);

  const existingNames = new Set(attachments.map((item) => String(item.name || "").toLowerCase()));
  const localAttachments = resolvedFiles
    .filter((file, index, arr) => arr.findIndex((item) => item.toLowerCase() === file.toLowerCase()) === index)
    .map(attachmentFromFile)
    .filter(Boolean)
    .filter((item) => !existingNames.has(String(item.name || "").toLowerCase()));

  const allTargets = [
    ...attachedTargets,
    ...localAttachments.map(targetFromAttachment).filter(Boolean)
  ];
  const lastAnalysisTarget = allTargets[allTargets.length - 1] || null;
  const hint = analysisHint({ targets: allTargets, usedLastTarget: useLast });

  return {
    attachments: localAttachments,
    lastAnalysisTarget,
    message: hint ? [message, hint].filter(Boolean).join("\n\n") : message,
    handled: Boolean(localAttachments.length || attachedTargets.length || useLast),
    usedLastTarget: useLast
  };
}

module.exports = {
  extractFileReferences,
  isAnalysisIntent,
  isContinuationIntent,
  prepareAnalysisContext
};
