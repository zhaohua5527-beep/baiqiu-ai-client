const fs = require("node:fs");
const path = require("node:path");
const { AgentCommunicationProtocol } = require("../protocol/agent-communication-protocol");

const DEFAULT_COLLABORATION_ROOT = path.join("D:\\BaiQiuAI", "data", "collaboration");

function nowIso() {
  return new Date().toISOString();
}

function makeId() {
  return `msg-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

class AgentMessageBus {
  constructor({ rootDir = DEFAULT_COLLABORATION_ROOT, maxMessages = 500, protocol = null } = {}) {
    this.rootDir = rootDir;
    this.filePath = path.join(rootDir, "messages.json");
    this.maxMessages = maxMessages;
    this.protocol = protocol || new AgentCommunicationProtocol();
    this.ensureStore();
  }

  publish({ from = "", to = "", type = "", payload = {}, traceId = "", sessionId = "" } = {}) {
    const baseMessage = {
      id: makeId(),
      from,
      to,
      type,
      payload,
      traceId,
      sessionId,
      status: "published",
      timestamp: nowIso()
    };
    const wrapped = this.protocol.createMessage(baseMessage);
    const message = wrapped.message;
    const data = this.load();
    data.messages.push(message);
    this.save({ messages: data.messages.slice(-this.maxMessages) });
    return message;
  }

  list(filter = {}) {
    return this.load().messages.filter((message) => {
      if (filter.traceId && message.traceId !== filter.traceId) return false;
      if (filter.sessionId && message.sessionId !== filter.sessionId) return false;
      if (filter.to && message.to !== filter.to) return false;
      if (filter.type && message.type !== filter.type) return false;
      return true;
    });
  }

  clear() {
    this.save({ messages: [] });
  }

  ensureStore() {
    fs.mkdirSync(this.rootDir, { recursive: true });
    if (!fs.existsSync(this.filePath)) this.save({ messages: [] });
  }

  load() {
    this.ensureStore();
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      return { messages: Array.isArray(parsed.messages) ? parsed.messages : [] };
    } catch {
      return { messages: [] };
    }
  }

  save(data = {}) {
    fs.mkdirSync(this.rootDir, { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify({ messages: Array.isArray(data.messages) ? data.messages : [] }, null, 2), "utf8");
  }
}

module.exports = { AgentMessageBus, DEFAULT_COLLABORATION_ROOT };
