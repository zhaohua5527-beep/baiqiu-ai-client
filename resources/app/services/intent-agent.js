const DEFAULT_CONFIDENCE = 0.74;

function normalizeText(input) {
  return String(input || "").replace(/\s+/g, " ").trim();
}

function splitClauses(input) {
  const text = normalizeText(input);
  if (!text) return [];
  return text
    .split(/(?:，|,|。|；|;|、然后|然后|顺便|并且|同时|另外|接着|最后|以及)/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function isNegatedOffice(text) {
  return /(?:不要|别|无需|不需要|不是|无需打开).{0,8}(?:WPS|office|模板|Word|Excel|PPT)/i.test(text);
}

function hasCreateAction(text) {
  return /(写|做|生成|开发|创建|制作|新建|保存|放到桌面|放桌面|输出|生成到桌面)/i.test(text);
}

function hasSoftwareTarget(text) {
  return /(软件|程序|应用|小工具|网页|html|electron|代码|app)/i.test(text);
}

function hasOpenAction(text) {
  return /(打开|启动|运行|调出|唤起|open|start|launch)/i.test(text);
}

function hasCalculator(text) {
  return /(计算器|calculator|calc)/i.test(text);
}

function hasFileCreateTarget(text) {
  return /(?:[A-Za-z0-9_\-\u4e00-\u9fa5]+)\.(?:txt|md|json|csv|html|js|py)\b/i.test(text)
    || /(文件|文本|txt|文本文档)/i.test(text);
}

class IntentAgent {
  analyze(input, context = {}) {
    const text = normalizeText(input);
    const clauses = splitClauses(text);
    const intents = this.detectAll(text, clauses);
    return {
      text,
      clauses,
      intents,
      primaryIntent: intents[0]?.intent || "general.chat",
      isMultiStep: intents.length > 1 || clauses.length > 1,
      confidence: intents.length ? Math.max(...intents.map((item) => item.confidence || DEFAULT_CONFIDENCE)) : DEFAULT_CONFIDENCE,
      context: {
        sessionId: context.sessionId || "",
        hasAttachments: Boolean(context.hasAttachments)
      }
    };
  }

  detectAll(text, clauses = splitClauses(text)) {
    const candidates = [];
    const add = (intent, clause, confidence, reason) => {
      if (!intent) return;
      if (candidates.some((item) => item.intent === intent && item.clause === clause)) return;
      candidates.push({ intent, clause, confidence, reason });
    };

    const whole = normalizeText(text);
    const calculatorCreate = hasCalculator(whole) && hasCreateAction(whole);
    const calculatorOpen = hasCalculator(whole) && hasOpenAction(whole) && !calculatorCreate;

    if (/(你叫|你以后叫|你的名字|我叫|我的名字|叫我|称呼我|你是我的|我是)/i.test(whole)) {
      add("memory.persona", whole, 0.93, "身份/称呼记忆");
    }

    if (/(打开刚刚生成的文件|打开生成的文件|打开刚才生成的文件|鎵撳紑.*鐢熸垚.*鏂囦欢)/i.test(whole)) {
      add("system.open", whole, 0.9, "打开刚刚生成的文件");
    }

    if (hasCreateAction(whole) && hasFileCreateTarget(whole) && !hasOpenAction(whole) && !calculatorCreate) {
      add("file.create", whole, 0.96, "创建真实文件");
    }

    if (calculatorCreate) {
      add("dev.code.calculator", whole, 0.97, "创建可运行计算器");
    } else if (calculatorOpen) {
      add("math.calculator.open", whole, 0.96, "打开系统计算器");
    } else if (hasCreateAction(whole) && hasSoftwareTarget(whole)) {
      add("dev.code", whole, 0.9, "创建软件/程序");
    }

    if (hasOpenAction(whole) && !hasCreateAction(whole) && /(文件|文件夹|目录|项目|网址|网页|软件|程序|应用|桌面|下载)/i.test(whole) && !calculatorCreate) {
      add("system.open", whole, 0.88, "打开目标");
    }

    for (const clause of clauses.length ? clauses : [whole]) {
      const clauseHasCalculator = hasCalculator(clause);
      if (hasCreateAction(clause) && hasFileCreateTarget(clause) && !hasOpenAction(clause) && !clauseHasCalculator) {
        add("file.create", clause, 0.94, "创建真实文件");
        continue;
      }
      if (clauseHasCalculator && hasCreateAction(clause)) {
        add("dev.code.calculator", clause, 0.96, "创建可运行计算器");
        continue;
      }
      if (clauseHasCalculator && hasOpenAction(clause)) {
        add("math.calculator.open", clause, 0.95, "打开系统计算器");
        continue;
      }
      if (!hasCreateAction(clause) && /(打开|启动|运行|调出|唤起).*(桌面|下载|文件夹|目录|项目|网址|网页|软件|程序|应用|文件)/i.test(clause)) {
        add("system.open", clause, 0.8, "打开目标");
      }
      if (/(写代码|写程序|开发|创建|制作|搭建|生成).{0,24}(软件|程序|应用|小工具|网页|html|electron|代码)/i.test(clause)) {
        add("dev.code", clause, 0.82, "开发/生成程序");
      }
      if (!calculatorCreate && !hasSoftwareTarget(whole) && !isNegatedOffice(whole) && /(wps|excel|表格|word|文档|ppt|演示|办公模板|模板)/i.test(clause)) {
        add("office.doc", clause, 0.82, "办公文档");
      }
      if (/(记住|保存成技能|保存为技能|学习成技能|存成skill|保存skill|skill)/i.test(clause)) {
        add("skill.learn", clause, 0.8, "技能学习");
      }
      if (/(天气|气温|下雨|带伞|提醒)/i.test(clause)) {
        add("info.weather_or_reminder", clause, 0.68, "天气/提醒，需要外部工具支持");
      }
    }

    if (!candidates.length) add("general.chat", whole, DEFAULT_CONFIDENCE, "普通对话");
    return candidates;
  }
}

module.exports = { IntentAgent, splitClauses };
