const NUMBER_WORDS = new Map([
  ["one", 1],
  ["two", 2],
  ["three", 3],
  ["multiple", 3],
  ["\u4e00", 1],
  ["\u4e00\u4e2a", 1],
  ["\u4e24", 2],
  ["\u4e24\u4e2a", 2],
  ["\u4e8c", 2],
  ["\u4e09", 3],
  ["\u4e09\u4e2a", 3],
  ["\u591a\u4e2a", 3]
]);

function normalizeText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function hasAny(text, patterns = []) {
  return patterns.some((pattern) => pattern.test(text));
}

function parseCount(text = "", fallback = 1) {
  const value = normalizeText(text);
  const digit = value.match(/(\d+)\s*(?:\u4e2a|\u4efd|\u4e2a\u6587\u672c|\u4e2a\u6587\u4ef6)?/);
  if (digit) return Math.max(1, Math.min(20, Number(digit[1]) || fallback));
  for (const [word, count] of NUMBER_WORDS.entries()) {
    if (value.includes(word)) return count;
  }
  return fallback;
}

function parseTextFileCount(text = "", fallback = 3) {
  const value = normalizeText(text);
  const digit = value.match(/(\d+)\s*(?:\u4e2a)?\s*(?:\u6587\u672c\u6587\u4ef6|txt|text\s*files?)/i);
  if (digit) return Math.max(1, Math.min(20, Number(digit[1]) || fallback));
  for (const [word, count] of NUMBER_WORDS.entries()) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`${escaped}\\s*(?:\\u4e2a)?\\s*(?:\\u6587\\u672c\\u6587\\u4ef6|txt|text\\s*files?)`, "i");
    if (re.test(value)) return count;
  }
  return fallback;
}

class TaskDecomposer {
  decompose(input = "") {
    const text = normalizeText(input);
    if (!text) return [];
    if (this.isAmbiguousSmallTool(text)) {
      return [{ action: "clarify", target: "tool", reason: "missing_requirement" }];
    }
    if (this.isFolderWithFiles(text)) return this.decomposeFolderWithFiles(text);
    if (this.isFolderCreate(text)) return [{ action: "create", target: "folder", toolId: "create_folder" }];
    if (this.isCalculatorCreate(text)) return this.decomposeCalculator(text);
    if (this.isDeleteFile(text)) return [{ action: "delete", target: "file", toolId: "delete_file" }];
    if (this.isShutdown(text)) return [{ action: "shutdown", target: "computer" }];
    if (this.isSkillLearning(text)) return [{ action: "learn", target: this.skillTarget(text), toolId: "skill_install" }];
    return [];
  }

  isCalculatorCreate(text) {
    return hasAny(text, [/\u8ba1\u7b97\u5668|calculator|calc/i])
      && hasAny(text, [/\u5199|\u521b\u5efa|\u751f\u6210|\u505a|\u5236\u4f5c|create|build/i]);
  }

  isFolderWithFiles(text) {
    return hasAny(text, [/\u6587\u4ef6\u5939|folder/i])
      && hasAny(text, [/\u91cc\u9762|\u5176\u4e2d|\u653e\u5165|\u653e|\u4fdd\u5b58\u5230|inside|into/i])
      && hasAny(text, [/\u6587\u672c\u6587\u4ef6|txt|\u6587\u4ef6|text file/i]);
  }

  isFolderCreate(text) {
    return hasAny(text, [/\u6587\u4ef6\u5939|folder/i])
      && hasAny(text, [/\u521b\u5efa|\u65b0\u5efa|create|make/i]);
  }

  isDeleteFile(text) {
    return hasAny(text, [/\u5220\u9664|\u79fb\u9664|delete|remove/i])
      && hasAny(text, [/\u6587\u4ef6|file|txt|desktop|\u684c\u9762/i]);
  }

  isAmbiguousSmallTool(text) {
    return /^(?:\u5f04|\u505a|\u6765|build|make).{0,4}(?:\u4e2a)?(?:\u5c0f\u5de5\u5177|tool)\s*[。.!！?？]*$/i.test(text);
  }

  isShutdown(text) {
    return /\u5173\u95ed\u7535\u8111|\u5173\u673a|shutdown|power\s*off/i.test(text);
  }

  isSkillLearning(text) {
    return /\u5b66\u4e60|skill|\u6280\u80fd|\u5b89\u88c5/i.test(text) && /skill|\u6280\u80fd/i.test(text);
  }

  skillTarget(text) {
    if (/\u5929\u6c14|\u6c14\u6e29|\u9884\u62a5|weather/i.test(text)) return "weather";
    if (/\u63d0\u9192|\u5e26\u4f1e|\u5f00\u4f1a|remind/i.test(text)) return "reminder";
    return "skill";
  }

  decomposeCalculator(text) {
    const actions = [{ action: "create", target: "calculator", toolId: "calculator_creator" }];
    if (hasAny(text, [/\u6253\u5f00|\u542f\u52a8|\u8fd0\u884c|open|start|launch/i])) {
      actions.push({ action: "open", target: "calculator", toolId: "browser_open" });
    }
    return actions;
  }

  decomposeFolderWithFiles(text) {
    const count = parseTextFileCount(text, 3);
    const actions = [{ action: "create", target: "folder", toolId: "create_folder" }];
    for (let index = 1; index <= count; index += 1) {
      actions.push({
        action: "create",
        target: "text_file",
        toolId: "file_creator",
        countIndex: index,
        container: "folder"
      });
    }
    if (hasAny(text, [/\u6253\u5f00|\u542f\u52a8|\u8fd0\u884c|open|start|launch/i])) {
      actions.push({ action: "open", target: "folder", toolId: "browser_open" });
    }
    return actions;
  }
}

module.exports = { TaskDecomposer, parseCount, parseTextFileCount };
