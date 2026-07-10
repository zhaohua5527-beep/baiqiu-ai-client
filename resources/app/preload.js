const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("heiqiu", {
  init: () => ipcRenderer.invoke("app:init"),
  createSession: () => ipcRenderer.invoke("session:create"),
  selectSession: (id) => ipcRenderer.invoke("session:select", id),
  renameSession: (id, title) => ipcRenderer.invoke("session:rename", id, title),
  deleteSession: (id) => ipcRenderer.invoke("session:delete", id),
  favoriteSession: (id, pinned) => ipcRenderer.invoke("session:favorite", id, pinned),
  duplicateSession: (id) => ipcRenderer.invoke("session:duplicate", id),
  reorderSessions: (ids) => ipcRenderer.invoke("session:reorder", ids),
  messages: (id) => ipcRenderer.invoke("session:messages", id),
  appendMessage: (id, message) => ipcRenderer.invoke("session:append-message", id, message),
  saveSettings: (settings) => ipcRenderer.invoke("settings:save", settings),
  chooseSaveLocation: () => ipcRenderer.invoke("settings:choose-save-location"),
  updateInfo: () => ipcRenderer.invoke("app:update-info"),
  downloadUpdate: () => ipcRenderer.invoke("update:download"),
  currentVersion: () => ipcRenderer.invoke("update:current-version"),
  syncOpenClaw: () => ipcRenderer.invoke("app:sync-openclaw"),
  applyOnlineUpdate: () => ipcRenderer.invoke("app:apply-online-update"),
  publishUpdate: (payload) => ipcRenderer.invoke("admin:publish-update", payload),
  startUpdateServer: () => ipcRenderer.invoke("admin:start-update-server"),
  openAdminServer: () => ipcRenderer.invoke("admin:open-server"),
  verifyInvite: (code) => ipcRenderer.invoke("license:verify", code),
  confirmActivation: (payload) => ipcRenderer.invoke("license:confirm-activation", payload),
  generateInvite: (count) => ipcRenderer.invoke("license:generate", count),
  ownerStatus: () => ipcRenderer.invoke("license:owner-status"),
  createPurchaseOrder: (payload) => ipcRenderer.invoke("purchase:create-order", payload),
  getAutoLaunch: () => ipcRenderer.invoke("app:get-auto-launch"),
  setAutoLaunch: (enabled) => ipcRenderer.invoke("app:set-auto-launch", enabled),
  skills: () => ipcRenderer.invoke("openclaw:skills"),
  addSkill: (skill) => ipcRenderer.invoke("openclaw:skill-add", skill),
  learnSkill: (payload) => ipcRenderer.invoke("openclaw:skill-learn", payload),
  deleteSkill: (id) => ipcRenderer.invoke("openclaw:skill-delete", id),
  addMemory: (memory) => ipcRenderer.invoke("openclaw:memory-add", memory),
  deleteMemory: (id) => ipcRenderer.invoke("openclaw:memory-delete", id),
  productCreateTask: (payload) => ipcRenderer.invoke("product:create-task", payload),
  productSubmitTask: (payload) => ipcRenderer.invoke("product:submit-task", payload),
  productQueryTask: (taskId) => ipcRenderer.invoke("product:query-task", taskId),
  productTaskStatus: (taskId) => ipcRenderer.invoke("product:task-status", taskId),
  productTaskResult: (taskId) => ipcRenderer.invoke("product:task-result", taskId),
  productTaskHistory: (options) => ipcRenderer.invoke("product:task-history", options),
  abortChat: (id) => ipcRenderer.invoke("chat:abort", id),
  copyText: (text) => ipcRenderer.invoke("clipboard:write-text", text),
  windowControl: (action) => ipcRenderer.invoke("window:control", action),
  openOpenClaw: () => ipcRenderer.invoke("openclaw:dashboard"),
  openExternal: (target) => ipcRenderer.invoke("system:open-external", target),
  openPath: (target) => ipcRenderer.invoke("system:open-path", target),
  onGatewayStatus: (handler) => ipcRenderer.on("gateway:status", (_event, status) => handler(status)),
  onGatewayEvent: (handler) => ipcRenderer.on("gateway:event", (_event, frame) => handler(frame)),
  onUpdateDownloadProgress: (handler) => ipcRenderer.on("update:download-progress", (_event, progress) => handler(progress)),
  onUpdateProgress: (handler) => ipcRenderer.on("update:progress", (_event, state) => handler(state)),
  onToolConfirmation: (handler) => ipcRenderer.on("tool:confirmation-request", (_event, data) => handler(data)),
  confirmTool: (id, confirmed, mode) => ipcRenderer.send("tool:confirmation-response", { id, confirmed, mode }),
  onWindowActivity: (handler) => ipcRenderer.on("window:activity", (_event, state) => handler(state)),
  onCloseRequest: (handler) => ipcRenderer.on("close:request", (_event, data) => handler(data)),
  onSessionChanged: (handler) => ipcRenderer.on("session:changed", (_event, db) => handler(db))
});

contextBridge.exposeInMainWorld("updater", {
  checkForUpdate: () => ipcRenderer.invoke("update:check"),
  downloadUpdate: () => ipcRenderer.invoke("update:download"),
  getCurrentVersion: () => ipcRenderer.invoke("update:current-version"),
  onUpdateAvailable: (callback) => ipcRenderer.on("update-available", (_event, data) => callback(data)),
  onDownloadProgress: (callback) => ipcRenderer.on("update:download-progress", (_event, progress) => callback(progress))
});

contextBridge.exposeInMainWorld("license", {
  getStatus: () => ipcRenderer.invoke("license:status"),
  verifyCode: (code, customer) => ipcRenderer.invoke("license:verify", code, customer),
  confirmActivation: (payload) => ipcRenderer.invoke("license:confirm-activation", payload),
  getTrialInfo: () => ipcRenderer.invoke("license:trial-info"),
  getRemainingTrial: () => ipcRenderer.invoke("license:trial-remaining"),
  onLocked: (callback) => ipcRenderer.on("license:locked", (_event, data) => callback(data)),
  onTrialWarning: (callback) => ipcRenderer.on("license:trial-warning", (_event, data) => callback(data)),
  onTrialUpdate: (callback) => ipcRenderer.on("license:trial-update", (_event, data) => callback(data))
});

contextBridge.exposeInMainWorld("admin", {
  generateCodes: (count, type, notes) => ipcRenderer.invoke("admin:generate-codes", count, type, notes),
  exportCodes: (format) => ipcRenderer.invoke("admin:export-codes", format),
  getCodeList: () => ipcRenderer.invoke("admin:code-list"),
  manageCode: (code, action) => ipcRenderer.invoke("admin:manage-code", code, action),
  listOrders: () => ipcRenderer.invoke("admin:orders"),
  confirmOrder: (orderId) => ipcRenderer.invoke("admin:confirm-order", orderId),
  publishUpdate: (payload) => ipcRenderer.invoke("admin:publish-update", payload),
  startUpdateServer: () => ipcRenderer.invoke("admin:start-update-server"),
  openAdminServer: () => ipcRenderer.invoke("admin:open-server"),
  readLogs: (type, limit) => ipcRenderer.invoke("dev:logs", type, limit),
  exportLogs: () => ipcRenderer.invoke("dev:logs-export"),
  banCode: (code) => ipcRenderer.invoke("admin:ban-code", code),
  unbindCode: (code) => ipcRenderer.invoke("admin:unbind-code", code)
});




