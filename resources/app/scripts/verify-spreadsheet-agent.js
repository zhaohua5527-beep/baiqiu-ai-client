const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const XLSX = require("xlsx");
const SpreadsheetAgent = require("../services/spreadsheet-agent");

const workspace = "D:\\BaiQiuAI\\data\\workspace\\tests";
fs.mkdirSync(workspace, { recursive: true });
const file = path.join(workspace, "白球表格分析增强测试.xlsx");
fs.rmSync(file, { force: true });

const rows = [
  ["三级类目", "商品名称", "月销售额", "销量", "不动销率"],
  ["速食泡面", "红烧牛肉面", 3068.4, 120, 0.475],
  ["茶饮料", "柠檬茶", 2528.5, 96, 0.5603],
  ["方便粉/粉丝", "螺蛳粉", 2249.8, 88, 0.3478],
  ["碳酸饮料", "可口可乐", 2218.6, 140, 0.5128],
  ["包装饮用水", "农夫山泉", 2128.09, 180, 0.4717]
];

const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "销售明细");
XLSX.writeFile(workbook, file);

const buffer = fs.readFileSync(file);
const analysis = SpreadsheetAgent.analyzeWorkbook(XLSX, buffer, { name: path.basename(file) });
const text = SpreadsheetAgent.formatWorkbookAnalysis(analysis);
const sheet = analysis.sheets[0];
const ok = Boolean(
  sheet.rowCount === 5
  && sheet.importantColumns.sales === "月销售额"
  && sheet.importantColumns.quantity === "销量"
  && sheet.importantColumns.category === "三级类目"
  && /sum=12193\.39/.test(text)
  && /Top rows by 月销售额/.test(text)
);

console.log(JSON.stringify({
  ok,
  file,
  size: fs.statSync(file).size,
  rowCount: sheet.rowCount,
  importantColumns: sheet.importantColumns,
  preview: text.slice(0, 1800)
}, null, 2));

if (!ok) process.exit(1);
