const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { TaskExperience } = require("../services/product-sdk/task-experience");
const SpreadsheetAgent = require("../services/spreadsheet-agent");
const FileAnalysis = require("../services/file-analysis");

function main() {
  const cases = [];

  {
    const task = {
      taskId: "hf-task-1",
      productName: "desktop-assistant",
      message: "分析这个表格"
    };
    const created = TaskExperience.create(task, "received");
    const running = TaskExperience.advance({ ...task, experience: created }, "executing");
    assert.equal(created.message, "已接收");
    assert.equal(running.message, "正在执行");
    assert(!/[锛�姝宸]/.test(JSON.stringify(running)), "task experience should not contain mojibake");
    cases.push("task_experience_chinese_stage_labels");
  }

  {
    const fakeXlsx = {
      read: () => ({
        SheetNames: ["销售"],
        Sheets: { "销售": {} }
      }),
      utils: {
        sheet_to_json: () => [
          ["商品", "销售额", "数量"],
          ["A", 120, 2],
          ["B", 80, 1],
          ["A", 60, 1]
        ]
      }
    };
    const analysis = SpreadsheetAgent.analyzeWorkbook(fakeXlsx, Buffer.from("fake"), { name: "销售表.xlsx" });
    const text = SpreadsheetAgent.formatWorkbookAnalysis(analysis);
    assert(text.includes("工作表数量：1"));
    assert(text.includes("字段摘要："));
    assert(text.includes("销售额"));
    assert(!/[锛�姝宸]/.test(text), "spreadsheet summary should not contain mojibake");
    cases.push("spreadsheet_structured_summary_chinese");
  }

  {
    const refs = FileAnalysis.extractFileReferences("帮我分析 销售表.xlsx，再看看 图片.png");
    assert(refs.includes("销售表.xlsx"));
    assert(refs.includes("图片.png"));
    assert.equal(FileAnalysis.isAnalysisIntent("分析这个表格"), true);
    assert.equal(FileAnalysis.isContinuationIntent("继续分析"), true);
    cases.push("file_analysis_reference_and_intent");
  }

  {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "baiqiu-file-analysis-"));
    const file = path.join(dir, "复盘数据.csv");
    fs.writeFileSync(file, "商品,金额\nA,10\nB,20\n", "utf8");
    const prepared = FileAnalysis.prepareAnalysisContext({
      message: "继续分析",
      lastTarget: { path: file, name: "复盘数据.csv", mimeType: "text/csv", ext: ".csv" },
      searchRoots: [dir]
    });
    assert.equal(prepared.usedLastTarget, true);
    assert.equal(prepared.attachments.length, 1);
    assert(prepared.message.includes("继续基于上一份文件/图片"));
    assert(prepared.attachments[0].textContent.includes("商品,金额"));
    cases.push("file_analysis_continuation_uses_last_target");
  }

  {
    const mainSource = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");
    assert(mainSource.includes('if (id === "openclaw") return true;'), "openclaw image gateway should not be blocked by local image guard");
    assert(mainSource.includes("image_url"), "vision-capable providers should receive OpenAI image_url content");
    assert(/qwen\.\*vl|qwen-vl|glm-4v|llava|pixtral/.test(mainSource), "vision model detection should include common multimodal models");
    assert(/\\u4e0d\\u8981\\u5047\\u88c5|不要假装/.test(mainSource), "unsupported image reply must not pretend to inspect images");
    cases.push("image_vision_routing_and_degradation_guard");
  }

  {
    const mainSource = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");
    assert(mainSource.includes("function spreadsheetAttachmentAnalysisReply"), "spreadsheet attachments need a deterministic local analysis reply");
    assert(mainSource.includes("spreadsheetAttachmentAnalysisReply(attachments)"), "spreadsheet analysis must run before generic model routing");
    assert(mainSource.includes("spreadsheetParseError"), "spreadsheet parse errors should be reported instead of crashing or blaming permissions");
    assert(!mainSource.includes("无法直接读取上传的 xlsx 附件内容"), "runtime must not claim uploaded xlsx cannot be read when local parser exists");
    cases.push("spreadsheet_attachment_local_analysis_guard");
  }

  {
    const mainSource = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");
    assert(mainSource.includes("function summarizeSpreadsheetForUser"), "spreadsheet replies should have a compact user-facing summary");
    assert(mainSource.includes("summarizeSpreadsheetForUser(item.spreadsheetAnalysis)"), "spreadsheet runtime should show compact analysis instead of raw parser text");
    assert(!mainSource.includes("attachmentText(item).slice(0, 16000)"), "spreadsheet runtime must not dump long raw analysis into chat");
    cases.push("spreadsheet_reply_compact_summary_guard");
  }

  {
    const mainSource = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");
    const rendererSource = fs.readFileSync(path.join(__dirname, "..", "renderer", "app.js"), "utf8");
    assert(mainSource.includes("function runCalculatorShortcut"), "calculator requests need a deterministic product runtime shortcut");
    assert(mainSource.includes('toolId: "calculator_creator"'), "calculator shortcut must use calculator_creator");
    assert(mainSource.includes('agentIntent: "dev.code.calculator"'), "calculator shortcut must keep the correct ToolSelector intent");
    assert(rendererSource.includes("function isCalculatorCreationPrompt"), "UI should route calculator creation before the long generic task path");
    assert(rendererSource.includes("正在生成计算器"), "UI should show immediate calculator progress");
    cases.push("calculator_shortcut_product_runtime_guard");
  }

  {
    const mainSource = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");
    assert(mainSource.includes("function readableToolError"), "tool error objects should be formatted for users");
    assert(mainSource.includes("计算器生成失败：${errorText}"), "calculator shortcut should not stringify raw error objects");
    assert(!mainSource.includes("计算器生成失败：${execution.error"), "calculator shortcut must not produce [object Object]");
    cases.push("calculator_error_object_format_guard");
  }

  {
    const mainSource = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");
    assert(mainSource.includes("function effectiveLicenseUnlocked"), "permission layer should use effective license state");
    assert(mainSource.includes("if (isDevMode) return true;"), "developer activated UI state must unlock write permissions");
    assert(mainSource.includes("isUnlocked: effectiveLicenseUnlocked(db)"), "ToolRegistry PermissionManager must sync with effective activation state");
    assert(!mainSource.includes("isUnlocked: Boolean(db.settings?.license?.unlocked)"), "permission sync must not rely only on stale db.settings.license.unlocked");
    cases.push("license_permission_sync_guard");
  }

  {
    const rendererSource = fs.readFileSync(path.join(__dirname, "..", "renderer", "app.js"), "utf8");
    const productSubmitBlocks = rendererSource.match(/return api\.productSubmitTask\(\{[\s\S]*?\n  \}\);/g) || [];
    const runtimeBlocks = productSubmitBlocks.filter((block) => /desktop\.chat_runtime|desktop\.chat/.test(block));
    assert(runtimeBlocks.length >= 2, "chat runtime submit helpers should be present");
    for (const block of runtimeBlocks) {
      assert(block.includes("skipPersist: true"), "UI-owned chat runtime persistence must avoid duplicate messages");
    }
    cases.push("chat_runtime_skip_persist_duplicate_guard");
  }

  {
    const rendererSource = fs.readFileSync(path.join(__dirname, "..", "renderer", "app.js"), "utf8");
    const stylesSource = fs.readFileSync(path.join(__dirname, "..", "renderer", "styles.css"), "utf8");
    assert(rendererSource.includes("function renderMarkdown"), "renderer should keep markdown renderer");
    assert(rendererSource.includes("renderTable(lines)"), "markdown tables should render as HTML tables");
    assert(rendererSource.includes("<ol>"), "numbered markdown lists should render as ordered lists");
    assert(rendererSource.includes("<blockquote>"), "markdown blockquotes should render");
    assert(rendererSource.includes('target="_blank"'), "markdown links should be clickable");
    assert(stylesSource.includes(".rendered .markdown-table-wrap"), "markdown tables need stable chat styling");
    cases.push("markdown_rendering_table_guard");
  }

  console.log(JSON.stringify({ ok: true, cases }, null, 2));
}

main();
