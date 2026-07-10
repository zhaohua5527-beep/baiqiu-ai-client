const fs = require("node:fs");
const path = require("node:path");
const { IntentAgent } = require("../services/intent-agent");
const { PlannerAgent } = require("../services/planner-agent");

const intentAgent = new IntentAgent();
const plannerAgent = new PlannerAgent();

const calculatorCreate = [
  "帮我写一个计算器软件放桌面然后打开",
  "做个白球计算器 html 放到桌面并启动",
  "生成一个能加减乘除的计算器小工具，保存桌面，再打开",
  "给客户做一个本地计算器网页，放桌面",
  "创建计算器应用，支持百分比，然后帮我打开",
  "写个 calculator 程序放桌面",
  "我要一个计算器软件，不要 WPS，放桌面",
  "帮我们写个计算器软件放桌面然后打开",
  "制作一个网页计算器并打开",
  "开发一个简单计算器小工具，保存到桌面"
];

const calculatorOpen = [
  "打开计算器",
  "启动系统计算器",
  "帮我调出 calculator",
  "运行电脑自带计算器",
  "打开一下计算器软件",
  "帮我唤起计算器",
  "start calculator",
  "open 计算器",
  "运行 calc",
  "我要算账，打开计算器"
];

const persona = [
  "你叫赵华，我叫BOSS",
  "你的名字叫赵华，我的名字叫BOSS",
  "以后叫我老板，你是我的助手赵华",
  "记住，我叫小李，你叫白球",
  "我是BOSS，你叫赵华",
  "你的身份是财务助理，我叫老板",
  "请称呼我王总，你叫小白",
  "你以后叫赵华",
  "我的名字是BOSS",
  "你是我的助手，我叫张总"
];

const office = [
  "帮我做一个 Excel 表格",
  "生成一份 Word 文档",
  "做个 WPS 模板",
  "帮我整理成 PPT",
  "创建一个办公表格",
  "写一份文档模板",
  "做商品价格表格",
  "生成销售日报 Excel",
  "帮我写 Word 合同草稿",
  "做一个演示 PPT"
];

const mixed = [
  "明天成都天气，顺便提醒我带伞，然后保存成Skill",
  "查天气，再把结果保存成技能",
  "帮我看明天会不会下雨，并提醒我",
  "查询成都气温，然后记住我怕冷",
  "天气好的话提醒我出门",
  "帮我创建提醒，明天带伞",
  "保存一个天气提醒 Skill",
  "明天上海天气，然后生成提醒",
  "查一下天气并写入技能库",
  "提醒我下午开会，顺便保存成Skill"
];

const systemOpen = [
  "打开桌面的报价单",
  "启动一个不存在的软件 abcxyz123",
  "打开文件夹",
  "运行桌面上的程序",
  "打开网址网页",
  "帮我打开下载目录",
  "启动应用",
  "打开刚刚生成的文件",
  "运行软件",
  "打开项目目录"
];

const general = [
  "你好",
  "今天状态怎么样",
  "给我一个简短建议",
  "解释一下什么是现金流",
  "帮我想个标题",
  "用中文回复",
  "你能做什么",
  "总结一下思路",
  "给我三个方案",
  "说说注意事项"
];

const cases = [];
function add(group, expected, list, blocked = false) {
  for (const text of list) cases.push({ group, text, expected, blocked });
}

for (let i = 0; i < 3; i += 1) add("calculator_create", "dev.code.calculator", calculatorCreate);
for (let i = 0; i < 2; i += 1) add("calculator_open", "math.calculator.open", calculatorOpen);
for (let i = 0; i < 2; i += 1) add("persona", "memory.persona", persona);
add("office", "office.doc", office);
add("mixed_blocked", "info.weather_or_reminder", mixed, true);
add("system_open", "system.open", systemOpen);
add("general", "general.chat", general);

const selected = cases.slice(0, 100);
const results = selected.map((item, index) => {
  const analysis = intentAgent.analyze(item.text, { sessionId: `test-${index}` });
  const plan = plannerAgent.createPlan(analysis, { sessionId: `test-${index}` });
  const intents = analysis.intents.map((entry) => entry.intent);
  const intentOk = intents.includes(item.expected) || analysis.primaryIntent === item.expected;
  const blockedOk = Boolean(plan.blocked) === Boolean(item.blocked);
  const taskOk = plan.tasks.length > 0;
  const ok = intentOk && blockedOk && taskOk;
  return {
    index: index + 1,
    group: item.group,
    text: item.text,
    expected: item.expected,
    actual: analysis.primaryIntent,
    intents,
    tasks: plan.tasks.map((task) => ({ id: task.id, title: task.title, status: task.executable === false ? "blocked" : "planned" })),
    blocked: plan.blocked,
    ok,
    failureReason: ok ? "" : [
      intentOk ? "" : "意图识别不匹配",
      blockedOk ? "" : "阻塞状态不匹配",
      taskOk ? "" : "未生成任务"
    ].filter(Boolean).join("；")
  };
});

const passed = results.filter((item) => item.ok).length;
const failed = results.length - passed;
const report = {
  generatedAt: new Date().toISOString(),
  total: results.length,
  passed,
  failed,
  successRate: Number((passed / results.length).toFixed(4)),
  failureRate: Number((failed / results.length).toFixed(4)),
  failures: results.filter((item) => !item.ok),
  results
};

const out = path.join(__dirname, "..", "agent-acceptance-report.json");
fs.writeFileSync(out, JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify({
  total: report.total,
  passed: report.passed,
  failed: report.failed,
  successRate: report.successRate,
  report: out
}, null, 2));

if (failed > 0) process.exitCode = 1;
