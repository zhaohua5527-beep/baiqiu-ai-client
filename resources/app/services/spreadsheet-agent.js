function cleanCell(value) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).replace(/\s+/g, " ").trim();
}

function toNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = cleanCell(value).replace(/[,，￥¥%]/g, "");
  if (!text || !/^-?\d+(?:\.\d+)?$/.test(text)) return null;
  const num = Number(text);
  return Number.isFinite(num) ? num : null;
}

function looksLikeHeader(row = []) {
  const cells = row.map(cleanCell).filter(Boolean);
  if (cells.length < 2) return false;
  const textCount = cells.filter((cell) => toNumber(cell) === null).length;
  return textCount >= Math.ceil(cells.length * 0.6);
}

function uniqueHeader(headers, index) {
  const raw = cleanCell(headers[index]) || `列${index + 1}`;
  const base = raw.slice(0, 40);
  let name = base;
  let suffix = 2;
  const previous = headers.slice(0, index).map(cleanCell);
  while (previous.includes(name)) {
    name = `${base}_${suffix}`;
    suffix += 1;
  }
  return name;
}

function detectHeaderIndex(rows) {
  const limit = Math.min(rows.length, 20);
  for (let index = 0; index < limit; index += 1) {
    if (looksLikeHeader(rows[index])) return index;
  }
  return 0;
}

function topEntries(map, limit = 8) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([value, count]) => `${value}(${count})`);
}

function inferColumnKind(name, values) {
  const lower = String(name || "").toLowerCase();
  const numericRatio = values.length ? values.filter((item) => item.number !== null).length / values.length : 0;
  if (numericRatio >= 0.75) {
    if (/销售|金额|营收|收入|gmv|price|amount|sales|cost|利润|毛利/.test(lower)) return "金额/销售";
    if (/率|占比|比例|百分比|rate|ratio|percent/.test(lower)) return "比例";
    if (/数|数量|库存|件|sku|count|qty|quantity/.test(lower)) return "数量";
    return "数值";
  }
  if (/日期|时间|date|time/.test(lower)) return "日期/时间";
  return "文本/分类";
}

function summarizeColumn(name, values, totalRows) {
  const nonEmpty = values.filter((item) => item.text);
  const numeric = nonEmpty.map((item) => item.number).filter((num) => num !== null);
  const kind = inferColumnKind(name, nonEmpty);
  const missing = Math.max(0, totalRows - nonEmpty.length);
  const summary = { name, kind, nonEmpty: nonEmpty.length, missing };
  if (numeric.length >= Math.max(2, nonEmpty.length * 0.5)) {
    const sum = numeric.reduce((acc, num) => acc + num, 0);
    summary.sum = Number(sum.toFixed(4));
    summary.avg = Number((sum / numeric.length).toFixed(4));
    summary.min = Math.min(...numeric);
    summary.max = Math.max(...numeric);
  } else {
    const counts = new Map();
    for (const item of nonEmpty) {
      if (!item.text || item.text.length > 80) continue;
      counts.set(item.text, (counts.get(item.text) || 0) + 1);
    }
    summary.topValues = topEntries(counts, 6);
    summary.unique = counts.size;
  }
  return summary;
}

function pickImportantColumns(columns) {
  const sales = columns.find((col) => /销售额|销售金额|成交额|金额|营收|收入|gmv|sales|amount/i.test(col.name) && typeof col.sum === "number");
  const quantity = columns.find((col) => /销量|销售量|数量|件数|订单|月售|qty|quantity|count/i.test(col.name) && typeof col.sum === "number");
  const category = columns.find((col) => /分类|类目|品类|类别|category|type/i.test(col.name) && col.kind === "文本/分类");
  const product = columns.find((col) => /商品|产品|名称|品名|标题|sku|product|name/i.test(col.name) && col.kind === "文本/分类");
  const rate = columns.find((col) => /动销|占比|比例|率|rate|ratio|percent/i.test(col.name));
  return { sales, quantity, category, product, rate };
}

function rowObject(headers, row) {
  const obj = {};
  headers.forEach((header, index) => {
    obj[header] = cleanCell(row[index]);
  });
  return obj;
}

function topRowsByColumn(headers, dataRows, columnName, limit = 8) {
  const index = headers.indexOf(columnName);
  if (index < 0) return [];
  return dataRows
    .map((row) => ({ row, value: toNumber(row[index]) }))
    .filter((item) => item.value !== null)
    .sort((a, b) => b.value - a.value)
    .slice(0, limit)
    .map((item) => rowObject(headers, item.row));
}

function summarizeSheet(name, rawRows) {
  const rows = rawRows.filter((row) => Array.isArray(row) && row.some((cell) => cleanCell(cell)));
  if (!rows.length) return { name, empty: true, rowCount: 0, columnCount: 0 };
  const headerIndex = detectHeaderIndex(rows);
  const headerRow = rows[headerIndex] || [];
  const columnCount = Math.max(...rows.map((row) => row.length));
  const headers = Array.from({ length: columnCount }, (_item, index) => uniqueHeader(headerRow, index));
  const dataRows = rows.slice(headerIndex + 1);
  const columns = headers.map((header, colIndex) => {
    const values = dataRows.map((row) => {
      const text = cleanCell(row[colIndex]);
      return { text, number: toNumber(row[colIndex]) };
    });
    return summarizeColumn(header, values, dataRows.length);
  });
  const important = pickImportantColumns(columns);
  const topRows = [];
  for (const col of [important.sales, important.quantity, important.rate].filter(Boolean)) {
    topRows.push({ by: col.name, rows: topRowsByColumn(headers, dataRows, col.name, 6) });
  }
  return {
    name,
    rowCount: dataRows.length,
    columnCount,
    headerRow: headerIndex + 1,
    headers,
    importantColumns: Object.fromEntries(Object.entries(important).map(([key, value]) => [key, value?.name || ""])),
    columns: columns.slice(0, 80),
    topRows,
    sampleRows: dataRows.slice(0, 12).map((row) => rowObject(headers, row))
  };
}

function analyzeWorkbook(XLSX, buffer, { name = "表格文件", maxSheets = 12 } = {}) {
  if (!XLSX) throw new Error("缺少 xlsx 解析能力");
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheets = workbook.SheetNames.slice(0, maxSheets).map((sheetName) => {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, blankrows: false, raw: true });
    return summarizeSheet(sheetName, rows);
  });
  return {
    fileName: name,
    sheetCount: workbook.SheetNames.length,
    analyzedSheetCount: sheets.length,
    totalRows: sheets.reduce((sum, sheet) => sum + Number(sheet.rowCount || 0), 0),
    totalColumns: sheets.reduce((sum, sheet) => sum + Number(sheet.columnCount || 0), 0),
    sheets
  };
}

function formatWorkbookAnalysis(analysis) {
  const lines = [
    `[SpreadsheetAgent: ${analysis.fileName}]`,
    `工作表数量：${analysis.sheetCount}，已分析：${analysis.analyzedSheetCount}`,
    `总数据行：${analysis.totalRows}，总列数：${analysis.totalColumns}`,
    "",
    "请基于以下结构化表格数据进行分析：先给结论，再给关键数据证据，再给可执行建议；不要编造未出现的数据。"
  ];
  for (const sheet of analysis.sheets || []) {
    lines.push("", `## Sheet: ${sheet.name}`);
    if (sheet.empty) {
      lines.push("空表。");
      continue;
    }
    lines.push(`数据行：${sheet.rowCount}，列数：${sheet.columnCount}，表头行：第 ${sheet.headerRow} 行`);
    lines.push(`字段：${(sheet.headers || []).slice(0, 40).join(" | ")}`);
    const important = Object.entries(sheet.importantColumns || {})
      .filter(([, value]) => value)
      .map(([key, value]) => `${key}=${value}`)
      .join("；");
    if (important) lines.push(`关键字段识别：${important}`);
    lines.push("字段摘要：");
    for (const col of (sheet.columns || []).slice(0, 30)) {
      const metrics = typeof col.sum === "number"
        ? `sum=${col.sum}, avg=${col.avg}, min=${col.min}, max=${col.max}`
        : `unique=${col.unique || 0}, top=${(col.topValues || []).join("、") || "无"}`;
      lines.push(`- ${col.name} [${col.kind}] 非空=${col.nonEmpty}, 缺失=${col.missing}, ${metrics}`);
    }
    for (const top of sheet.topRows || []) {
      if (!top.rows?.length) continue;
      lines.push(`Top rows by ${top.by}:`);
      for (const row of top.rows.slice(0, 5)) lines.push(`- ${JSON.stringify(row)}`);
    }
    if (sheet.sampleRows?.length) {
      lines.push("样例行：");
      for (const row of sheet.sampleRows.slice(0, 5)) lines.push(`- ${JSON.stringify(row)}`);
    }
  }
  return lines.join("\n").slice(0, 220000);
}

module.exports = {
  analyzeWorkbook,
  formatWorkbookAnalysis
};
