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

  console.log(JSON.stringify({ ok: true, cases }, null, 2));
}

main();
