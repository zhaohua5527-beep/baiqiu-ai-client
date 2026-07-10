const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const XLSX = require("xlsx");

const workspace = "D:\\BaiQiuAI\\data\\workspace\\tests";
fs.mkdirSync(workspace, { recursive: true });
const file = path.join(workspace, "baiqiu-action-filter-test.xlsx");
fs.rmSync(file, { force: true });

const sample = [
  "OK, I will create an Excel report on Desktop.",
  "",
  "```baiqiu-action",
  "{\"actions\":[{\"type\":\"write_xlsx\",\"path\":\"desktop/baiqiu-action-filter-test.xlsx\",\"sheets\":[{\"name\":\"Test\",\"rows\":[[\"Item\",\"Result\"],[\"Hidden protocol\",\"PASS\"]]}]}],\"actions\":[{\"type\":\"open_path\",\"path\":\"desktop/baiqiu-action-filter-test.xlsx\"}]}",
  "</parameter>"
].join("\n");

function normalizeProtocolText(text) {
  return String(text || "").replace(/\uFEFF/g, "").replace(/[｜∣❘]/g, "|").replace(/[“”]/g, "\"").replace(/[‘’]/g, "'");
}

function balancedJsonSlice(source, startIndex) {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = startIndex; i < source.length; i += 1) {
    const ch = source[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === "\"") {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(startIndex, i + 1);
    }
  }
  return "";
}

function extractJsonActionObjects(raw) {
  const source = normalizeProtocolText(raw);
  const actions = [];
  const pattern = /\{\s*"type"\s*:/gi;
  let match;
  while ((match = pattern.exec(source))) {
    const json = balancedJsonSlice(source, match.index);
    if (!json) continue;
    try {
      const parsed = JSON.parse(json);
      if (parsed?.type) actions.push(parsed);
    } catch {}
  }
  return actions;
}

const actions = [];
const visible = sample.replace(/```baiqiu-action\s*([\s\S]*?)(?:```|<\/parameter>|$)/gi, (_match, json) => {
  actions.push(...extractJsonActionObjects(json));
  return "";
}).trim();

const types = actions.map((item) => item.type);
if (!types.includes("write_xlsx") || !types.includes("open_path") || /baiqiu-action|write_xlsx|actions|parameter/i.test(visible)) {
  console.log(JSON.stringify({ ok: false, reason: "protocol leaked or actions not parsed", visible, types }, null, 2));
  process.exit(1);
}

const write = actions.find((item) => item.type === "write_xlsx");
const workbook = XLSX.utils.book_new();
const sheet = write.sheets[0];
XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(sheet.rows), sheet.name);
XLSX.writeFile(workbook, file);
const stat = fs.existsSync(file) ? fs.statSync(file) : null;
const ok = Boolean(stat && stat.isFile() && stat.size > 100);
console.log(JSON.stringify({ ok, visible, types, file, size: stat?.size || 0 }, null, 2));
if (!ok) process.exit(1);
