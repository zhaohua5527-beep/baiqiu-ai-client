const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const { MemoryCore } = require("../services/memory-architecture/memory-core");
const { ShortTermMemory } = require("../services/memory-architecture/short-term-memory");
const { LongTermMemory } = require("../services/memory-architecture/long-term-memory");
const { EpisodicMemory } = require("../services/memory-architecture/episodic-memory");
const { SemanticMemory } = require("../services/memory-architecture/semantic-memory");
const { MemoryRetriever } = require("../services/memory-architecture/memory-retriever");

function root(name) {
  const dir = path.join("D:\\BaiQiuAI", "data", "memory-architecture-tests", `run-${process.pid}`, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function readSourceFiles() {
  const dir = path.join(__dirname, "..", "services", "memory-architecture");
  return fs.readdirSync(dir)
    .filter((file) => file.endsWith(".js"))
    .map((file) => fs.readFileSync(path.join(dir, file), "utf8"))
    .join("\n");
}

function run() {
  const memoryRoot = root("memory");
  const shortTermMemory = new ShortTermMemory({ rootDir: memoryRoot, maxItems: 3 });
  const longTermMemory = new LongTermMemory({
    rootDir: memoryRoot,
    memoryCenter: { snapshot: () => ({ user: { name: "测试用户", preferences: ["中文回复"] }, context: { project: { name: "白球AI" } } }) }
  });
  const episodicMemory = new EpisodicMemory({ rootDir: memoryRoot });
  const semanticMemory = new SemanticMemory({ rootDir: memoryRoot });
  const retriever = new MemoryRetriever({ rootDir: memoryRoot, shortTermMemory, longTermMemory, episodicMemory, semanticMemory });

  shortTermMemory.remember({ content: "active calculator context", taskType: "dev.code.calculator", tags: ["active_task"] });
  shortTermMemory.remember({ content: "第二条上下文" });
  shortTermMemory.remember({ content: "第三条上下文" });
  shortTermMemory.remember({ content: "fourth calculator context", taskType: "dev.code.calculator" });
  assert.strictEqual(shortTermMemory.recent(10).length, 3, "short term memory should enforce maxItems");
  assert(shortTermMemory.query({ keyword: "calculator" }).some((item) => item.taskType === "dev.code.calculator"));

  const fact = longTermMemory.rememberFact({ content: "项目名称是白球AI", type: "project", tags: ["project"] });
  assert(fact.memoryId, "long term fact should be recorded");
  const importedFacts = longTermMemory.importMemoryCenterSnapshot();
  assert(importedFacts.some((item) => item.content.includes("测试用户")), "MemoryCenter snapshot should import user fact");

  const episode = episodicMemory.recordEpisode({
    taskType: "dev.code.calculator",
    content: "calculator_creator generated HTML",
    result: "success",
    success: true,
    tags: ["calculator_creator"]
  });
  assert(episode.success, "episodic memory should keep task result");

  const concept = semanticMemory.addConcept({
    taskType: "dev.code.calculator",
    concept: "calculator_creator",
    content: "generate calculator app",
    relations: ["browser_open"]
  });
  assert(concept.concept === "calculator_creator", "semantic memory should store concepts");

  const retrieved = retriever.retrieve({ keyword: "calculator", taskType: "dev.code.calculator", limit: 5 });
  assert(retrieved.memories.length >= 3, "retriever should search across layers");
  assert(retrieved.memories[0].retrievalScore >= retrieved.memories[retrieved.memories.length - 1].retrievalScore, "retriever should rank results");

  const coreRoot = root("core");
  const core = new MemoryCore({
    rootDir: coreRoot,
    identityMemory: {
      saveSnapshot: () => ({
        agentId: "agent-memory-test",
        experienceCount: 1,
        knowledgeCount: 1,
        reflectionCount: 1,
        improvementCount: 1
      })
    },
    knowledgeCenter: {
      loadKnowledge: () => ({
        items: [
          { type: "task", taskType: "dev.code.calculator", toolId: "calculator_creator", result: "created", successRate: 0.99 }
        ]
      })
    },
    experienceCenter: {
      list: () => [
        { taskType: "file.create", toolId: "file_creator", errorType: "file_exists", solution: "rename_file", success: true }
      ]
    },
    reflectionMemory: {
      loadReflections: () => ({
        reflections: [
          { taskType: "file.create", improvement: "先检查文件是否存在", status: "success", confidence: 0.9 }
        ]
      })
    },
    skillRegistry: {
      listSkills: () => [
        { skillId: "weather", name: "天气查询", status: "registered", taskTypes: ["weather.query"], capabilities: ["weather"], tools: [] }
      ]
    },
    goalManager: {
      listGoals: () => [
        { taskType: "dev.code.calculator", goal: "创建计算器", status: "active", confidence: 0.8 }
      ]
    }
  });
  core.remember({ scope: "long_term", content: "长期事实" });
  const snapshot = core.syncExternalMemory({ agentId: "agent-memory-test" });
  assert.strictEqual(snapshot.safety.executesTool, false, "MemoryCore must not execute tools");
  assert(snapshot.layers.longTerm >= 1, "MemoryCore should sync identity into long term memory");
  assert(snapshot.layers.semantic >= 2, "MemoryCore should sync knowledge and skills into semantic memory");
  assert(snapshot.layers.episodic >= 2, "MemoryCore should sync experience and reflection into episodic memory");
  assert(snapshot.connectedSystems.includes("Identity"));
  assert(snapshot.connectedSystems.includes("Knowledge"));
  assert(snapshot.connectedSystems.includes("Experience"));
  assert(snapshot.connectedSystems.includes("Reflection"));
  assert(snapshot.connectedSystems.includes("Skill"));
  assert(snapshot.connectedSystems.includes("Goal"));

  const source = readSourceFiles();
  assert(!source.includes("ToolExecutionService.execute"), "memory architecture must not call ToolExecutionService");
  assert(!source.includes("ToolSelector.execute"), "memory architecture must not bypass ToolSelector");
  assert(!source.includes("VerifierCenter.verify"), "memory architecture must not bypass VerifierCenter");

  for (const file of [
    "memory-core.json",
    "short-term-memory.json",
    "long-term-memory.json",
    "episodic-memory.json",
    "semantic-memory.json",
    "memory-retrievals.json"
  ]) {
    assert(fs.existsSync(path.join(coreRoot, file)) || fs.existsSync(path.join(memoryRoot, file)), `${file} should exist`);
  }

  return {
    ok: true,
    cases: [
      "short_term_memory",
      "long_term_memory",
      "episodic_memory",
      "semantic_memory",
      "memory_retriever",
      "memory_core_external_connections",
      "no_tool_or_verifier_bypass"
    ]
  };
}

if (require.main === module) console.log(JSON.stringify(run(), null, 2));

module.exports = { run };
