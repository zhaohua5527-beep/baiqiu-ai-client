const fs = require("node:fs");
const path = require("node:path");
const { TaskDecomposer } = require("./planning/task-decomposer");
const { DependencyBuilder } = require("./planning/dependency-builder");
const { RiskAnalyzer } = require("./planning/risk-analyzer");
const { ExperienceCenter } = require("./experience/experience-center");
const { StrategyOptimizer } = require("./optimization/strategy-optimizer");
const { KnowledgeRetriever } = require("./knowledge/knowledge-retriever");
const { ReasoningEngine } = require("./reasoning/reasoning-engine");
const { MetaLearningCenter } = require("./meta-learning/meta-learning-center");
const { ReflectionMemory } = require("./reflection/reflection-memory");
const { AutonomousPlanner } = require("./planning/autonomous-planner");
const { SelfImprovementEngine } = require("./self-improvement/self-improvement-engine");
const { LearningOrchestrator } = require("./learning/learning-orchestrator");
const { KnowledgeEvolutionNetwork } = require("./evolution-network/knowledge-evolution-network");
const { getDefaultAgentStateManager } = require("./agent_state_manager");
const { getDefaultAgentEventBus, AGENT_EVENTS } = require("./neural-core/agent-event-bus");
const { ExperienceStore } = require("./neural-core/experience-store");
const { StrategyEngine } = require("./neural-core/strategy-engine");
const { DecisionEngine } = require("./neural-core/decision-engine");
const { AgentManager } = require("./neural-core/agent-manager");
const { TeamPlanner } = require("./neural-core/team-planner");

const DEFAULT_SAFE_ROOT = path.join("D:\\BaiQiuAI", "data", "workspace");

function metric(name, data) {
  try { require("./neural-core/agent-event-bus").recordRuntimeMetric?.(name, data); } catch {}
}

function safePlannerCall(name, fallback, fn) {
  const startedAt = Date.now();
  try {
    const result = fn();
    metric(`PlannerAgent.${name}`, { duration: Date.now() - startedAt, success: true });
    return result;
  } catch (error) {
    metric(`PlannerAgent.${name}`, { duration: Date.now() - startedAt, success: false });
    try {
      require("./neural-core/agent-event-bus").writeDiagnostics?.({
        error: require("./neural-core/agent-event-bus").normalizeError?.(error, "NC2001", `planner.${name}`)
      });
    } catch {}
    return typeof fallback === "function" ? fallback(error) : fallback;
  }
}

function extractFileNames(text = "") {
  const names = [];
  const seen = new Set();
  const re = /([A-Za-z0-9_\-\u4e00-\u9fa5]+)\.(txt|md|json|csv|html|js|py)\b/gi;
  let match;
  while ((match = re.exec(String(text || "")))) {
    const base = String(match[1] || "")
      .replace(/^(?:\u521b\u5efa|\u65b0\u5efa|\u751f\u6210|\u5199\u5165|\u590d\u5236\u6210|\u590d\u5236\u4e3a|\u7136\u540e\u590d\u5236\u6210|\u7136\u540e\u590d\u5236\u4e3a|\u518d\u6253\u5f00|\u6253\u5f00)+/i, "")
      .replace(/^(?:create|copyto|copyas|open)+/i, "");
    const name = `${base || match[1]}.${match[2].toLowerCase()}`;
    const key = name.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      names.push(name);
    }
  }
  return names;
}

function wantsCopyThenOpen(text = "") {
  const value = String(text || "");
  return /\u590d\u5236|copy/i.test(value) && /\u6253\u5f00|open|start/i.test(value);
}

class PlannerAgent {
  constructor({ capabilityCenter = null, experienceCenter = null, strategyOptimizer = null, knowledgeRetriever = null, reasoningEngine = null, metaLearningCenter = null, reflectionMemory = null, autonomousPlanner = null, selfImprovementEngine = null, learningOrchestrator = null, knowledgeEvolutionNetwork = null, stateManager = null, eventBus = null, experienceStore = null, strategyEngine = null, decisionEngine = null, agentManager = null, teamPlanner = null } = {}) {
    this.capabilityCenter = capabilityCenter;
    this.experienceCenter = experienceCenter || new ExperienceCenter();
    this.strategyOptimizer = strategyOptimizer || new StrategyOptimizer({ experienceCenter: this.experienceCenter });
    this.knowledgeRetriever = knowledgeRetriever || new KnowledgeRetriever();
    this.reasoningEngine = reasoningEngine || new ReasoningEngine();
    this.metaLearningCenter = metaLearningCenter || new MetaLearningCenter();
    this.reflectionMemory = reflectionMemory || new ReflectionMemory();
    this.selfImprovementEngine = selfImprovementEngine || new SelfImprovementEngine();
    this.learningOrchestrator = learningOrchestrator || new LearningOrchestrator();
    this.knowledgeEvolutionNetwork = knowledgeEvolutionNetwork || new KnowledgeEvolutionNetwork();
    this.stateManager = stateManager || getDefaultAgentStateManager();
    this.eventBus = eventBus || getDefaultAgentEventBus();
    this.experienceStore = experienceStore || new ExperienceStore();
    this.strategyEngine = strategyEngine || new StrategyEngine();
    this.decisionEngine = decisionEngine || new DecisionEngine();
    this.agentManager = agentManager || new AgentManager({ eventBus: this.eventBus });
    this.teamPlanner = teamPlanner || new TeamPlanner({ eventBus: this.eventBus });
    this.stateManager.attachEventBus?.(this.eventBus);
    this.taskDecomposer = new TaskDecomposer();
    this.dependencyBuilder = new DependencyBuilder();
    this.riskAnalyzer = new RiskAnalyzer();
    this.autonomousPlanner = autonomousPlanner || new AutonomousPlanner({
      taskDecomposer: this.taskDecomposer,
      dependencyBuilder: this.dependencyBuilder,
      reasoningEngine: this.reasoningEngine,
      knowledgeRetriever: this.knowledgeRetriever,
      metaLearningCenter: this.metaLearningCenter,
      reflectionMemory: this.reflectionMemory,
      experienceCenter: this.experienceCenter
    });
  }

  createPlan(intentAnalysis, context = {}) {
    const plannerStartedAt = Date.now();
    const tasks = [];
    const sourceText = intentAnalysis.text || "";
    const sessionId = context.sessionId || context.traceId || intentAnalysis.context?.sessionId || "global";
    this.eventBus.publish(AGENT_EVENTS.PLAN_CREATED, {
      sessionId,
      intent: intentAnalysis.primaryIntent || "",
      userIntent: intentAnalysis.primaryIntent || "",
      goal: sourceText,
      currentAgent: "planner"
    });
    const knowledgeHints = safePlannerCall("knowledge", {}, () => this.knowledgeRetriever.retrieve({
      task: sourceText,
      taskType: intentAnalysis.primaryIntent || "",
      intent: intentAnalysis.primaryIntent || ""
    }));
    const experienceMemoryHints = safePlannerCall("experience", [], () => this.experienceStore.query({
      taskType: intentAnalysis.primaryIntent || "",
      intent: intentAnalysis.primaryIntent || "",
      problem: sourceText,
      keywords: this.queryKeywords(sourceText, intentAnalysis.primaryIntent || ""),
      limit: 5
    }));
    const strategyResult = safePlannerCall("strategy", null, () => this.strategyEngine.chooseStrategy({
      taskType: intentAnalysis.primaryIntent || "",
      experiences: experienceMemoryHints,
      riskLevel: this.initialRiskLevel(intentAnalysis.primaryIntent || "", sourceText),
      goal: sourceText
    }));
    const strategyDecision = safePlannerCall("decision", null, () => this.decisionEngine.decide({
      taskType: intentAnalysis.primaryIntent || "",
      strategy: strategyResult,
      experiences: strategyResult?.experiencesUsed || experienceMemoryHints,
      riskLevel: strategyResult?.riskLevel || this.initialRiskLevel(intentAnalysis.primaryIntent || "", sourceText),
      goal: sourceText
    }));
    const agentTeam = safePlannerCall("agent_team", null, () => this.agentManager.createTeam({
      taskType: intentAnalysis.primaryIntent || "",
      goal: sourceText,
      strategy: strategyResult,
      sessionId,
      traceId: context.traceId || sessionId
    }));
    const reasoningResult = safePlannerCall("reasoning", { taskType: intentAnalysis.primaryIntent || "", candidatePlans: [], selectedPlan: null, confidence: 0.3, reason: "NC2001 Planner advisory fallback" }, () => this.reasoningEngine.reason({
      goal: sourceText,
      taskType: intentAnalysis.primaryIntent || "",
      availableCapability: this.capabilityCenter ? "checked" : "unknown",
      historicalExperience: [...(this.experienceCenter?.list?.() || []), ...experienceMemoryHints],
      knowledgeHints,
      strategyResult,
      strategyDecision,
      agentTeam
    }));
    const metaHints = safePlannerCall("meta_learning", [], () => this.metaLearningCenter.getHints({
      taskType: intentAnalysis.primaryIntent || reasoningResult.taskType || ""
    }));
    const reflectionHints = safePlannerCall("reflection_memory", [], () => this.reflectionMemory.getHints({
      taskType: intentAnalysis.primaryIntent || reasoningResult.taskType || ""
    }));
    const improvementHints = safePlannerCall("self_improvement", [], () => this.selfImprovementEngine.getHints({
      taskType: intentAnalysis.primaryIntent || reasoningResult.taskType || ""
    }));
    const learningHints = safePlannerCall("learning", [], () => this.learningOrchestrator.getHints({
      taskType: intentAnalysis.primaryIntent || reasoningResult.taskType || ""
    }));
    const evolutionHints = safePlannerCall("evolution", [], () => this.knowledgeEvolutionNetwork.getHints({
      taskType: intentAnalysis.primaryIntent || reasoningResult.taskType || ""
    }));
    const add = (task) => {
      const id = task.id || `plan-${tasks.length + 1}`;
      const advisedTask = this.applyExperienceAdvice({ ...task, id });
      const risk = this.riskAnalyzer.analyze(advisedTask);
      tasks.push({
        id,
        taskId: id,
        parentTaskId: "",
        name: advisedTask.name || advisedTask.title || id,
        title: advisedTask.title || advisedTask.name || id,
        action: advisedTask.action || "",
        target: advisedTask.target || "",
        intent: advisedTask.intent || "general.chat",
        type: advisedTask.type || "analysis",
        toolId: advisedTask.toolId || "",
        args: advisedTask.args || null,
        dependsOn: Array.isArray(advisedTask.dependsOn) ? advisedTask.dependsOn : [],
        parallelGroup: advisedTask.parallelGroup || "default",
        retryLimit: Number.isFinite(Number(advisedTask.retryLimit)) ? Number(advisedTask.retryLimit) : 1,
        verifier: advisedTask.verifier || "manual",
        executable: advisedTask.executable !== false,
        riskLevel: advisedTask.riskLevel || risk.riskLevel,
        requiresPermission: typeof advisedTask.requiresPermission === "boolean" ? advisedTask.requiresPermission : risk.requiresPermission,
        needUserConfirm: typeof advisedTask.needUserConfirm === "boolean" ? advisedTask.needUserConfirm : risk.needUserConfirm,
        permissionScope: advisedTask.permissionScope || risk.permissionScope,
        reason: advisedTask.reason || "",
        experienceRecommendation: advisedTask.experienceRecommendation || null,
        optimizationRecommendation: this.strategyOptimizer.getRecommendation?.({
          taskType: advisedTask.intent || "",
          toolId: advisedTask.toolId || "",
          reasoningResult
        }) || null
      });
      return id;
    };

    let autonomousPlan = null;
    try {
      autonomousPlan = this.autonomousPlanner.plan({
        text: sourceText,
        knowledgeHints,
        reasoningResult,
        metaHints,
        reflectionHints
      });
      if (Array.isArray(autonomousPlan.steps) && autonomousPlan.steps.length) {
        for (const step of autonomousPlan.steps) add(step);
        return this.finish(intentAnalysis, { ...context, plannerStartedAt }, tasks, true, knowledgeHints, reasoningResult, metaHints, reflectionHints, autonomousPlan, improvementHints, learningHints, evolutionHints, experienceMemoryHints, strategyResult, strategyDecision, agentTeam);
      }
    } catch {
      autonomousPlan = { error: "autonomous_planner_failed", fallback: true };
    }

    const decomposed = this.planDecomposedActions(sourceText, add);
    if (decomposed) return this.finish(intentAnalysis, { ...context, plannerStartedAt }, tasks, true, knowledgeHints, reasoningResult, metaHints, reflectionHints, autonomousPlan, improvementHints, learningHints, evolutionHints, experienceMemoryHints, strategyResult, strategyDecision, agentTeam);

    const copyOpenTasks = this.planCopyThenOpen(sourceText, add);
    if (copyOpenTasks) {
      return this.finish(intentAnalysis, { ...context, plannerStartedAt }, tasks, true, knowledgeHints, reasoningResult, metaHints, reflectionHints, autonomousPlan, improvementHints, learningHints, evolutionHints, experienceMemoryHints, strategyResult, strategyDecision, agentTeam);
    }

    for (const item of intentAnalysis.intents || []) {
      const capability = this.capabilityCenter?.canPlanIntent?.(item.intent, {
        ...context,
        userMessage: sourceText
      });
      if (capability && capability.available === false) {
        add({
          id: `${item.intent}.missing_capability`.replace(/[^a-zA-Z0-9_.-]/g, "_"),
          title: item.clause || item.intent,
          intent: item.intent,
          type: "missing_capability",
          verifier: "capability",
          retryLimit: 0,
          executable: false,
          reason: capability.reason || `缺少能力：${(capability.missing || []).join(", ")}`
        });
        continue;
      }
      if (item.intent === "file.create") {
        add({
          id: "file.create",
          title: "创建并验证真实文件",
          intent: item.intent,
          type: "tool",
          toolId: "file_creator",
          args: { message: sourceText },
          verifier: "file_creator",
          retryLimit: 1
        });
        continue;
      }
      if (item.intent === "dev.code.calculator") {
        add({
          id: "calculator.create_verify_open",
          title: "创建、验证并打开 HTML 计算器",
          intent: item.intent,
          type: "tool",
          toolId: "calculator_creator",
          args: { message: sourceText },
          verifier: "calculator_creator",
          retryLimit: 1
        });
        continue;
      }
      if (item.intent === "dev.code") {
        add({
          id: "html_app.create_verify_open",
          title: "创建、验证并打开 HTML 应用",
          intent: item.intent,
          type: "tool",
          toolId: "html_app_creator",
          args: { message: sourceText },
          verifier: "html_app_creator",
          retryLimit: 1
        });
        continue;
      }
      if (item.intent === "math.calculator.open") {
        add({
          id: "system.calculator.open",
          title: "打开系统计算器",
          intent: item.intent,
          type: "tool",
          toolId: "run_command",
          args: { command: "start calc" },
          verifier: "tool_success",
          retryLimit: 1
        });
        continue;
      }
      if (item.intent === "system.open") {
        add({
          id: "system.open",
          title: "打开目标",
          intent: item.intent,
          type: "tool",
          toolId: "open_path",
          args: { path: sourceText },
          verifier: "open_path",
          retryLimit: 1
        });
        continue;
      }
      if (item.intent === "memory.persona") {
        add({ id: "memory.persona.update", title: "更新全局身份记忆", intent: item.intent, type: "memory_write", verifier: "memory_persisted", retryLimit: 1 });
        continue;
      }
      add({
        id: `${item.intent}.${tasks.length + 1}`.replace(/[^a-zA-Z0-9_.-]/g, "_"),
        title: item.clause || item.intent,
        intent: item.intent,
        type: "llm_or_unavailable",
        verifier: "manual",
        retryLimit: 0,
        executable: item.intent !== "info.weather_or_reminder",
        reason: item.intent === "info.weather_or_reminder" ? "当前缺少真实天气/提醒工具，不能假装完成。" : ""
      });
    }

    return this.finish(intentAnalysis, { ...context, plannerStartedAt }, tasks, Boolean(intentAnalysis.isMultiStep), knowledgeHints, reasoningResult, metaHints, reflectionHints, autonomousPlan, improvementHints, learningHints, evolutionHints, experienceMemoryHints, strategyResult, strategyDecision, agentTeam);
  }

  initialRiskLevel(intent = "", text = "") {
    const value = `${intent} ${text}`;
    if (/shutdown|delete|删除|关机|system_shutdown/i.test(value)) return "high";
    if (/创建|写入|create|write|file|folder/i.test(value)) return "medium";
    return "low";
  }

  queryKeywords(text = "", intent = "") {
    const raw = `${text} ${intent}`;
    const keywords = raw
      .split(/[^A-Za-z0-9_\-\u4e00-\u9fa5]+/)
      .map((item) => item.trim())
      .filter((item) => item.length >= 2);
    if (/calculator|计算器|計算器/i.test(raw)) keywords.push("calculator", "计算器", "dev.code.calculator");
    if (/桌面|desktop/i.test(raw)) keywords.push("desktop", "桌面");
    if (/文件夹|folder/i.test(raw)) keywords.push("folder", "文件夹");
    return [...new Set(keywords)].slice(0, 30);
  }

  planDecomposedActions(sourceText, add) {
    const actions = this.taskDecomposer.decompose(sourceText);
    if (!actions.length) return false;
    const steps = actions.map((action, index) => {
      const normalized = { ...action };
      if (normalized.action === "open" && normalized.target === "folder" && /第一个文件|第1个文件|first\s*file/i.test(sourceText)) {
        normalized.target = "text_file";
      }
      return this.actionToTask(normalized, index, sourceText);
    });
    const withDependencies = this.dependencyBuilder.apply(steps);
    for (const step of withDependencies) add(step);
    return true;
  }

  actionToTask(action, index, sourceText) {
    const id = `step-${index + 1}.${action.action}.${action.target}`.replace(/[^a-zA-Z0-9_.-]/g, "_");
    const wantsFirstFileOpen = /第一个文件|第1个文件|first\s*file/i.test(sourceText);
    const boundToolId = action.target === "text_file" && (action.action === "open" || (action.container === "folder" && wantsFirstFileOpen))
      ? this.toolFor(action)
      : (action.toolId || this.toolFor(action));
    const base = {
      id,
      taskId: id,
      name: this.titleFor(action),
      title: this.titleFor(action),
      action: action.action,
      target: action.target,
      intent: this.intentFor(action),
      type: action.action === "clarify" ? "clarification" : "tool",
      toolId: boundToolId,
      args: this.argsFor(action, sourceText),
      dependsOn: Array.isArray(action.dependsOn) ? action.dependsOn : [],
      verifier: this.verifierFor(action),
      retryLimit: action.action === "clarify" ? 0 : 1,
      executable: action.action !== "clarify",
      reason: action.reason || ""
    };
    if (action.action === "learn" && /^(weather|reminder)$/.test(String(action.target || ""))) {
      base.executable = false;
      base.reason = action.target === "weather"
        ? "缺少真实天气查询工具或天气 API，不能安装天气查询技能。"
        : "缺少真实提醒/日程工具，不能安装提醒技能。";
    }
    return base;
  }

  titleFor(action) {
    if (action.action === "clarify") return "补充需求后再规划";
    if (action.target === "calculator" && action.action === "create") return "创建计算器软件";
    if (action.target === "calculator" && action.action === "open") return "打开计算器软件";
    if (action.target === "folder" && action.action === "create") return "创建文件夹";
    if (action.target === "folder" && action.action === "open") return "打开文件夹";
    if (action.target === "text_file") return `创建文本文件${action.countIndex || ""}`;
    if (action.action === "shutdown") return "关闭电脑";
    if (action.action === "learn") return "学习技能";
    return `${action.action}.${action.target}`;
  }

  intentFor(action) {
    if (action.action === "clarify") return "clarification.required";
    if (action.target === "calculator") return "dev.code.calculator";
    if (action.target === "folder" || action.target === "text_file") return action.action === "open" ? "system.open" : "file.create";
    if (action.action === "delete") return "file.delete";
    if (action.action === "shutdown") return "system.shutdown";
    if (action.action === "learn") return "skill.learn";
    return "general.chat";
  }

  toolFor(action) {
    if (action.action === "clarify") return "";
    if (action.target === "calculator" && action.action === "create") return "calculator_creator";
    if (action.target === "text_file" && action.action === "open") return "open_path";
    if (action.target === "text_file" && action.container === "folder") return "write_text_file";
    if (action.action === "open") return "browser_open";
    if (action.target === "folder" && action.action === "create") return "create_folder";
    if (action.target === "text_file") return "file_creator";
    if (action.action === "delete") return "delete_file";
    if (action.action === "shutdown") return "system_shutdown";
    if (action.action === "learn") return "skill_install";
    return "";
  }

  argsFor(action, sourceText) {
    if (action.target === "text_file" && action.container === "folder" && /第一个文件|第1个文件|first\s*file/i.test(sourceText)) {
      const index = action.countIndex || 1;
      return {
        path: `{{step1.folder}}\\白球文件${index}.txt`,
        content: `由白球AI创建：白球文件${index}.txt\n创建时间：${new Date().toISOString()}\n用户请求：${sourceText}\n`
      };
    }
    if (action.action === "open" && action.target === "text_file") return { path: "{{step2.path}}" };
    if (action.target === "text_file") {
      return { message: sourceText, index: action.countIndex || 1, container: action.container || "" };
    }
    if (action.target === "folder") return { message: sourceText, target: "folder" };
    if (action.action === "open" && action.target === "calculator") return { path: "{{step1.file}}", target: action.target, internalApp: true };
    if (action.action === "open" && action.target === "text_file") return { path: "{{step2.firstFile}}", target: action.target };
    if (action.action === "open") return { message: sourceText, target: action.target };
    if (action.action === "shutdown") return { message: sourceText };
    if (action.action === "delete") return { message: sourceText };
    if (action.action === "learn") return { message: sourceText, target: action.target };
    return { message: sourceText };
  }

  verifierFor(action) {
    if (action.target === "calculator" && action.action === "create") return "calculator_creator";
    if (action.action === "open") return "browser_open";
    if (action.target === "text_file") return "file_creator";
    if (action.target === "folder") return "folder_exists";
    if (action.action === "delete") return "delete_file";
    return "manual";
  }

  planCopyThenOpen(sourceText, add) {
    const names = extractFileNames(sourceText);
    if (names.length < 2 || !wantsCopyThenOpen(sourceText)) return false;
    const source = names[0];
    const target = names[1];
    const content = `由白球AI创建：${source}\n复制目标：${target}\n创建时间：${new Date().toISOString()}\n`;
    const t1 = add({
      id: "file.create.source",
      title: `创建 ${source}`,
      intent: "file.create",
      type: "tool",
      toolId: "write_text_file",
      args: { path: `desktop/${source}`, content },
      verifier: "file_exists",
      retryLimit: 1
    });
    const t2 = add({
      id: "file.copy.target",
      title: `复制为 ${target}`,
      intent: "file.create",
      type: "tool",
      toolId: "write_text_file",
      args: { path: `desktop/${target}`, content },
      dependsOn: [t1],
      verifier: "file_exists",
      retryLimit: 1
    });
    add({
      id: "file.open.target",
      title: `打开 ${target}`,
      intent: "system.open",
      type: "tool",
      toolId: "open_path",
      args: { path: `desktop/${target}` },
      dependsOn: [t2],
      verifier: "open_path",
      retryLimit: 0
    });
    return true;
  }

  finish(intentAnalysis, context, tasks, isMultiStep, knowledgeHints = null, reasoningResult = null, metaHints = null, reflectionHints = null, autonomousPlan = null, improvementHints = null, learningHints = null, evolutionHints = null, experienceMemoryHints = [], strategyResult = null, strategyDecision = null, agentTeam = null) {
    const steps = tasks.map((task, index) => ({
      id: task.id,
      step: index + 1,
      action: task.action || this.actionFromTask(task),
      target: task.target || "",
      toolId: task.toolId || "",
      args: task.args || {},
      dependsOn: Array.isArray(task.dependsOn) ? task.dependsOn : [],
      riskLevel: task.riskLevel || "low",
      requiresPermission: Boolean(task.requiresPermission),
      needUserConfirm: Boolean(task.needUserConfirm),
      executable: task.executable !== false
    }));
    const teamTaskGraph = safePlannerCall("team_planner", { teamId: agentTeam?.teamId || "", roleTasks: [], dependencies: [], recovered: true }, () => this.teamPlanner.buildTeamPlan({
      team: agentTeam,
      goal: intentAnalysis.text || "",
      strategy: strategyResult,
      steps: tasks,
      sessionId: context.sessionId || context.traceId || intentAnalysis.context?.sessionId || "global",
      traceId: context.traceId || context.sessionId || intentAnalysis.context?.sessionId || "global"
    }));
    const plan = {
      id: `plan-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      createdAt: Date.now(),
      goal: intentAnalysis.text || "",
      steps,
      sourceText: intentAnalysis.text || "",
      knowledgeHints,
      reasoningResult,
      metaHints,
      reflectionHints,
      improvementHints,
      learningHints,
      evolutionHints,
      experienceMemoryHints,
      strategyResult,
      strategyDecision,
      agentTeam,
      teamTaskGraph,
      autonomousPlan,
      primaryIntent: intentAnalysis.primaryIntent || "general.chat",
      isMultiStep: Boolean(isMultiStep),
      tasks,
      blocked: tasks.some((task) => task.executable === false),
      context: {
        sessionId: context.sessionId || intentAnalysis.context?.sessionId || ""
      }
    };
    this.eventBus.publish(AGENT_EVENTS.PLAN_CREATED, {
      sessionId: context.sessionId || context.traceId || intentAnalysis.context?.sessionId || "global",
      intent: intentAnalysis.primaryIntent || "general.chat",
      goal: intentAnalysis.text || "",
      plan
    });
    metric("PlannerAgent", { duration: Date.now() - Number(context.plannerStartedAt || Date.now()), success: true, hit: experienceMemoryHints.length > 0 });
    return plan;
  }

  applyExperienceAdvice(task = {}) {
    const recommendation = this.experienceCenter?.recommend?.({
      taskType: task.intent || "",
      toolId: task.toolId || ""
    });
    if (!recommendation?.found) return task;
    const solution = recommendation.recommendedAction;
    const args = task.args && typeof task.args === "object" ? { ...task.args } : task.args;
    if (solution === "open_path" && task.toolId === "browser_open" && task.intent === "system.open") {
      return {
        ...task,
        toolId: "open_path",
        verifier: "open_path",
        experienceRecommendation: recommendation
      };
    }
    if (solution === "use_workspace" && args && args.path && this.isUnsafeExplicitPath(args.path)) {
      return {
        ...task,
        args: { ...args, path: path.join(DEFAULT_SAFE_ROOT, path.basename(String(args.path))) },
        experienceRecommendation: recommendation
      };
    }
    if (solution === "rename_file" && args && args.path && fs.existsSync(args.path)) {
      const parsed = path.parse(String(args.path));
      return {
        ...task,
        args: { ...args, path: path.join(parsed.dir, `${parsed.name}(1)${parsed.ext}`) },
        experienceRecommendation: recommendation
      };
    }
    return task;
  }

  isUnsafeExplicitPath(value = "") {
    const raw = String(value || "");
    if (!path.isAbsolute(raw)) return false;
    const normalized = path.normalize(raw).toLowerCase();
    return !normalized.startsWith(path.normalize(DEFAULT_SAFE_ROOT).toLowerCase());
  }

  actionFromTask(task = {}) {
    if (task.type === "clarification") return "clarify";
    if (/open|browser/i.test(task.toolId || "")) return "open";
    if (/skill/i.test(task.intent || task.toolId || "")) return "learn";
    if (/shutdown/i.test(task.intent || task.toolId || "")) return "shutdown";
    if (task.toolId) return "create";
    return "analyze";
  }
}

module.exports = { PlannerAgent, extractFileNames };
