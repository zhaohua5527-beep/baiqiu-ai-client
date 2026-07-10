const fs = require("node:fs");
const path = require("node:path");
const { AgentMessageBus, DEFAULT_COLLABORATION_ROOT } = require("./agent-message-bus");
const { AgentCoordinator } = require("./agent-coordinator");
const { TeamPlanner } = require("./team-planner");

class AgentCollaborationCenter {
  constructor({ rootDir = DEFAULT_COLLABORATION_ROOT, messageBus = null, coordinator = null, teamPlanner = null } = {}) {
    this.rootDir = rootDir;
    this.messageBus = messageBus || new AgentMessageBus({ rootDir });
    this.teamPlanner = teamPlanner || new TeamPlanner();
    this.coordinator = coordinator || new AgentCoordinator({ messageBus: this.messageBus, teamPlanner: this.teamPlanner });
    this.sessionsFile = path.join(rootDir, "collaboration-sessions.json");
    this.ensureStore();
  }

  planCollaboration({ planObject = {}, sessionId = "", traceId = "" } = {}) {
    const coordination = this.coordinator.coordinate({ planObject, sessionId, traceId });
    const session = {
      sessionId,
      traceId,
      goal: planObject.goal || planObject.sourceText || "",
      status: coordination.status,
      agents: coordination.teamPlan.agents,
      assignmentCount: coordination.teamPlan.assignments.length,
      timestamp: new Date().toISOString()
    };
    this.appendSession(session);
    return {
      ...coordination,
      session
    };
  }

  collectResults(results = []) {
    return this.coordinator.summarize(results);
  }

  ensureStore() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.sessionsFile)) this.writeJson(this.sessionsFile, { sessions: [] });
  }

  appendSession(session = {}) {
    const data = this.readJson(this.sessionsFile, { sessions: [] });
    data.sessions.push(session);
    this.writeJson(this.sessionsFile, { sessions: data.sessions.slice(-300) });
  }

  readJson(file, fallback) {
    this.ensureStore();
    try {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      return fallback;
    }
  }

  writeJson(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  }
}

module.exports = { AgentCollaborationCenter };
