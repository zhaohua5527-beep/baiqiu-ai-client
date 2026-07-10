function textOf(value = "") {
  return String(value || "").trim();
}

function has(text = "", pattern) {
  return pattern.test(text);
}

class GoalAnalyzer {
  analyze(input = "") {
    const text = textOf(input);
    const goal = this.goalFor(text);
    return {
      goal,
      originalText: text,
      taskType: this.taskTypeFor(text),
      requirements: this.requirementsFor(text),
      target: this.targetFor(text)
    };
  }

  goalFor(text = "") {
    if (has(text, /\u8ba1\u7b97\u5668|calculator|calc/i)) return "create calculator application";
    if (has(text, /\u6587\u4ef6\u5939|folder/i)) return "manage folder and files";
    if (has(text, /\u8868\u683c|excel|xlsx|csv|data/i)) return "process data";
    if (has(text, /\u5b66\u4e60|skill|\u6280\u80fd/i)) return "learn skill";
    if (has(text, /\u5173\u673a|\u5173\u95ed\u7535\u8111|shutdown/i)) return "system automation";
    return "general task";
  }

  taskTypeFor(text = "") {
    if (has(text, /\u8ba1\u7b97\u5668|calculator|calc/i)) return "dev.code.calculator";
    if (has(text, /\u6587\u4ef6\u5939|folder|\u6587\u4ef6|file/i)) return "file.create";
    if (has(text, /\u8868\u683c|excel|xlsx|csv|data/i)) return "data.process";
    if (has(text, /\u5b66\u4e60|skill|\u6280\u80fd/i)) return "skill.learn";
    if (has(text, /\u5173\u673a|\u5173\u95ed\u7535\u8111|shutdown/i)) return "system.shutdown";
    return "general.chat";
  }

  targetFor(text = "") {
    if (has(text, /\u8ba1\u7b97\u5668|calculator|calc/i)) return "calculator";
    if (has(text, /\u6587\u4ef6\u5939|folder/i)) return "folder";
    if (has(text, /\u8868\u683c|excel|xlsx|csv|data/i)) return "spreadsheet";
    if (has(text, /\u5929\u6c14|weather/i)) return "weather";
    if (has(text, /\u5173\u673a|\u5173\u95ed\u7535\u8111|shutdown/i)) return "computer";
    return "";
  }

  requirementsFor(text = "") {
    const requirements = [];
    if (has(text, /\u8ba1\u7b97\u5668|calculator|calc/i)) {
      requirements.push("generate app", "save file");
      if (has(text, /\u6253\u5f00|\u8fd0\u884c|open|launch|start/i)) requirements.push("open application");
    }
    if (has(text, /\u6587\u4ef6\u5939|folder/i)) requirements.push("create folder");
    if (has(text, /\u4e09\u4e2a|3\s*\u4e2a|three/i) && has(text, /\u6587\u4ef6|file/i)) requirements.push("create 3 files");
    if (has(text, /\u6253\u5f00|open|launch|start/i) && !requirements.includes("open application")) requirements.push("open result");
    if (has(text, /\u5b66\u4e60|skill|\u6280\u80fd/i)) requirements.push("install skill");
    if (has(text, /\u5173\u673a|\u5173\u95ed\u7535\u8111|shutdown/i)) requirements.push("request system shutdown");
    if (!requirements.length) requirements.push("clarify or answer");
    return requirements;
  }
}

module.exports = { GoalAnalyzer };
