const fs = require("node:fs");
const path = require("node:path");
const { dataRoot } = require("../data-root");

const DEFAULT_REGISTRY_FILE = path.join(dataRoot(), "neural-core", "agent-registry.json");

function nowIso() {
  return new Date().toISOString();
}

function normalize(value = "") {
  return String(value || "").trim().toLowerCase();
}

function defaultAgents() {
  return [
    {
      agentId: "supervisor-agent",
      name: "SupervisorAgent",
      role: "supervisor",
      skills: ["intent", "policy", "routing"],
      capabilities: ["understand_goal", "classify_task", "decide_need_plan"],
      successRate: 1,
      taskHistory: [],
      availability: "available",
      confidence: 0.95
    },
    {
      agentId: "planner-agent",
      name: "PlannerAgent",
      role: "planner",
      skills: ["planning", "decomposition", "dependency"],
      capabilities: ["create_plan", "build_task_graph", "risk_aware_planning"],
      successRate: 1,
      taskHistory: [],
      availability: "available",
      confidence: 0.92
    },
    {
      agentId: "executor-agent",
      name: "ExecutorAgent",
      role: "executor",
      skills: ["execution", "tool_selection", "recovery"],
      capabilities: ["execute_tool_task", "coordinate_task_queue", "handle_recovery"],
      successRate: 1,
      taskHistory: [],
      availability: "available",
      confidence: 0.9
    },
    {
      agentId: "verifier-agent",
      name: "VerifierAgent",
      role: "verifier",
      skills: ["verification", "quality_check"],
      capabilities: ["verify_result", "detect_failure", "recommend_retry"],
      successRate: 1,
      taskHistory: [],
      availability: "available",
      confidence: 0.9
    }
  ];
}

class AgentRegistry {
  constructor({ filePath = DEFAULT_REGISTRY_FILE, eventBus = null } = {}) {
    this.filePath = filePath;
    this.eventBus = eventBus;
    this.ensureStore();
  }

  registerAgent(agent = {}) {
    const current = this.load();
    const item = this.normalizeAgent(agent);
    const index = current.agents.findIndex((entry) => entry.agentId === item.agentId);
    if (index >= 0) current.agents[index] = { ...current.agents[index], ...item, updatedAt: nowIso() };
    else current.agents.push({ ...item, createdAt: nowIso(), updatedAt: nowIso() });
    this.write(current);
    this.eventBus?.publish?.("AGENT_REGISTERED", { agentId: item.agentId, role: item.role, name: item.name });
    return item;
  }

  queryAgent(query = {}) {
    const agents = this.load().agents;
    if (query.agentId) return agents.find((item) => item.agentId === query.agentId) || null;
    if (query.role) return agents.filter((item) => item.role === query.role);
    return agents;
  }

  matchAgents({ role = "", skills = [], capabilities = [], taskType = "", limit = 4 } = {}) {
    const roleText = normalize(role);
    const skillSet = new Set(skills.map(normalize));
    const capabilitySet = new Set(capabilities.map(normalize));
    const taskText = normalize(taskType);
    return this.load().agents
      .filter((agent) => agent.availability !== "unavailable")
      .map((agent) => ({ ...agent, matchScore: this.scoreAgent(agent, { roleText, skillSet, capabilitySet, taskText }) }))
      .filter((agent) => agent.matchScore > 0)
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, Math.max(1, Number(limit) || 4));
  }

  updateSuccessRate(agentId, { success = true, taskType = "", duration = 0 } = {}) {
    const current = this.load();
    const agent = current.agents.find((item) => item.agentId === agentId);
    if (!agent) return null;
    const history = Array.isArray(agent.taskHistory) ? agent.taskHistory : [];
    history.push({ taskType, success: success === true, duration: Number(duration) || 0, timestamp: nowIso() });
    const recent = history.slice(-100);
    const successCount = recent.filter((item) => item.success).length;
    agent.taskHistory = recent;
    agent.successRate = recent.length ? Number((successCount / recent.length).toFixed(2)) : agent.successRate;
    agent.confidence = Number(Math.max(0.1, Math.min(1, (agent.successRate * 0.7) + 0.25)).toFixed(2));
    agent.updatedAt = nowIso();
    this.write(current);
    return agent;
  }

  scoreAgent(agent = {}, { roleText = "", skillSet = new Set(), capabilitySet = new Set(), taskText = "" } = {}) {
    let score = 0;
    if (roleText && normalize(agent.role) === roleText) score += 0.45;
    const skills = (agent.skills || []).map(normalize);
    const capabilities = (agent.capabilities || []).map(normalize);
    for (const skill of skills) if (skillSet.has(skill) || (taskText && taskText.includes(skill))) score += 0.08;
    for (const capability of capabilities) if (capabilitySet.has(capability) || (taskText && taskText.includes(capability))) score += 0.08;
    score += Number(agent.successRate || 0) * 0.2;
    score += Number(agent.confidence || 0) * 0.15;
    return Number(Math.min(1, score).toFixed(2));
  }

  normalizeAgent(agent = {}) {
    const role = agent.role || "worker";
    const agentId = agent.agentId || `${role}-${Date.now()}`;
    return {
      agentId,
      name: agent.name || agentId,
      role,
      skills: Array.isArray(agent.skills) ? agent.skills : [],
      capabilities: Array.isArray(agent.capabilities) ? agent.capabilities : [],
      successRate: Number.isFinite(Number(agent.successRate)) ? Number(agent.successRate) : 1,
      taskHistory: Array.isArray(agent.taskHistory) ? agent.taskHistory : [],
      availability: agent.availability || "available",
      confidence: Number.isFinite(Number(agent.confidence)) ? Number(agent.confidence) : 0.8
    };
  }

  load() {
    this.ensureStore();
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      return { agents: Array.isArray(parsed.agents) ? parsed.agents : [] };
    } catch {
      return { agents: [] };
    }
  }

  ensureStore() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    if (!fs.existsSync(this.filePath)) this.write({ agents: defaultAgents() });
  }

  write(data = {}) {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify({ agents: Array.isArray(data.agents) ? data.agents : [] }, null, 2), "utf8");
  }
}

module.exports = { AgentRegistry, DEFAULT_REGISTRY_FILE };
