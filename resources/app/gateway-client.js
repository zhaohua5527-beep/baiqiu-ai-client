const EventEmitter = require("node:events");
let WebSocket;
try {
  WebSocket = require("ws");
} catch {
  WebSocket = require("../openclaw-desktop/node_modules/ws");
}
const { getOpenClawConfig } = require("./config");

class GatewayClient extends EventEmitter {
  constructor() {
    super();
    this.ws = null;
    this.connected = false;
    this.reconnectTimer = null;
    this.requestId = 0;
    this.pending = new Map();
    this.config = getOpenClawConfig();
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    clearTimeout(this.reconnectTimer);

    this.config = getOpenClawConfig();
    if (this.ws) {
      try {
        this.ws.removeAllListeners();
        this.ws.terminate();
      } catch {}
    }
    this.ws = new WebSocket(this.config.wsUrl);
    this.emit("status", { state: "connecting" });

    this.ws.on("message", (data) => this.handleMessage(data));
    this.ws.on("error", (error) => {
      this.emit("status", { state: "error", message: error.message });
    });
    this.ws.on("close", () => {
      this.connected = false;
      this.emit("status", { state: "disconnected" });
      this.scheduleReconnect();
    });
  }

  waitUntilReady(timeoutMs = 60000) {
    if (this.connected) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error("Gateway connection timed out"));
      }, timeoutMs);

      const onStatus = (status) => {
        if (status.state === "connected") {
          cleanup();
          resolve();
        } else if (status.state === "auth_failed") {
          cleanup();
          reject(new Error(status.message || "Gateway authentication failed"));
        }
      };

      const cleanup = () => {
        clearTimeout(timeout);
        this.off("status", onStatus);
      };

      this.on("status", onStatus);
    });
  }

  scheduleReconnect() {
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.connect(), 3000);
  }

  handleMessage(data) {
    let frame;
    try {
      frame = JSON.parse(String(data));
    } catch {
      return;
    }

    if (frame.type === "event" && frame.event === "connect.challenge") {
      this.sendConnect();
      return;
    }

    if (frame.type === "res" && frame.id === "connect-1") {
      if (frame.ok) {
        this.connected = true;
        this.emit("status", { state: "connected", auth: frame.payload && frame.payload.auth });
      } else {
        this.emit("status", { state: "auth_failed", message: frame.error && frame.error.message });
      }
      return;
    }

    if (frame.type === "res" && this.pending.has(frame.id)) {
      const { resolve, reject, timeout } = this.pending.get(frame.id);
      clearTimeout(timeout);
      this.pending.delete(frame.id);
      if (frame.ok) resolve(frame.payload);
      else reject(new Error((frame.error && frame.error.message) || "Gateway request failed"));
      return;
    }

    if (frame.type === "event") {
      this.emit("event", frame);
    }
  }

  sendConnect() {
    try {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: "req",
          id: "connect-1",
          method: "connect",
          params: {
            minProtocol: 4,
            maxProtocol: 4,
            client: {
              id: "gateway-client",
              version: "0.1.0",
              platform: "win32",
              mode: "backend"
            },
            role: "operator",
            scopes: ["operator.read", "operator.write", "operator.admin"],
            caps: [],
            commands: [],
            permissions: {},
            auth: { token: this.config.token },
            locale: "zh-CN",
            userAgent: "openclaw-desktop-shell/0.1.0"
          }
        }));
      }
    } catch {
      // Gateway 杩樺湪鍚姩涓紝鎻℃墜澶辫触鍙拷鐣ワ紝绛夊緟閲嶈繛鍗冲彲
    }
  }

  sendFrame(frame) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    try {
      this.ws.send(JSON.stringify(frame));
    } catch {
      // Ignore transient websocket send failures; reconnect handles future calls.
    }
  }

  request(method, params = {}, timeoutMs = 30000) {
    if (!this.connected) {
      return Promise.reject(new Error("Gateway is not ready"));
    }
    const id = `${method}-${++this.requestId}`;
    const timeout = setTimeout(() => {
      if (!this.pending.has(id)) return;
      const { reject } = this.pending.get(id);
      this.pending.delete(id);
      reject(new Error(`${method} timed out`));
    }, timeoutMs);

    const promise = new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, timeout });
    });
    this.sendFrame({ type: "req", id, method, params });
    return promise;
  }

  listSessions(limit = 80) {
    return this.waitUntilReady().then(() => this.request("sessions.list", { agentId: "main", limit }));
  }

  renameSession(key, displayName) {
    return this.waitUntilReady().then(() => this.request("sessions.patch", {
      key,
      patch: { displayName }
    }));
  }

  describeSession(key) {
    return this.waitUntilReady().then(() => this.request("sessions.describe", { key }, 30000));
  }

  history(sessionKey, limit = 80) {
    return this.waitUntilReady().then(() => this.request("chat.history", { sessionKey, limit }, 30000));
  }

  deleteSession(key) {
    return this.waitUntilReady().then(() => this.request("sessions.delete", {
      key,
      deleteTranscript: true
    }, 30000));
  }

  sendChat({ sessionKey, message, systemPrompt = "", attachments = [], tools = [], idempotencyKey, agentId, sessionId }) {
    const params = {
      sessionKey: sessionKey || "agent:main:main",
      message,
      ...(systemPrompt ? { systemPrompt } : {}),
      deliver: false,
      idempotencyKey: idempotencyKey || `desktop-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      ...(agentId ? { agentId } : {}),
      ...(sessionId ? { sessionId } : {}),
      ...(attachments.length ? { attachments } : {}),
      ...(tools.length ? { tools, tool_choice: "auto" } : {})
    };
    return this.waitUntilReady().then(() => this.request("chat.send", params, 180000));
  }

  async abortChat({ sessionKey, runId }) {
    const methods = [
      ["chat.abort", { sessionKey, runId }],
      ["chat.cancel", { sessionKey, runId }],
      ["runs.abort", { sessionKey, runId }],
      ["sessions.abort", { key: sessionKey, sessionKey, runId }]
    ];
    await this.waitUntilReady();
    const errors = [];
    for (const [method, params] of methods) {
      try {
        return await this.request(method, params, 2500);
      } catch (error) {
        errors.push(`${method}: ${error.message}`);
      }
    }
    throw new Error(errors.join("; ") || "Abort is not supported by Gateway");
  }

  waitForRun(sessionKey, runId, timeoutMs = 180000) {
    return new Promise((resolve) => {
      const startedAt = Date.now();
      const timer = setTimeout(() => cleanup("timeout"), timeoutMs);
      const onEvent = (frame) => {
        const payload = frame.payload || {};
        if (payload.sessionKey && payload.sessionKey !== sessionKey) return;
        if (runId && payload.runId && payload.runId !== runId) return;
        if (frame.event === "chat" && ["final", "error", "aborted"].includes(payload.state)) {
          cleanup(payload.state);
        }
        if (frame.event === "sessions.changed" && payload.sessionKey === sessionKey && payload.session && payload.session.status !== "running") {
          cleanup(payload.session.status || "changed");
        }
      };
      const cleanup = (state) => {
        clearTimeout(timer);
        this.off("event", onEvent);
        resolve({ state, elapsedMs: Date.now() - startedAt });
      };
      this.on("event", onEvent);
    });
  }
}

module.exports = { GatewayClient };

