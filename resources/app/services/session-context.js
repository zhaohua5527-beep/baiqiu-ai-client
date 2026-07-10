function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function getSessionMemory(session = {}) {
  return safeObject(session.memory);
}

function getSessionScratch(session = {}) {
  return safeObject(getSessionMemory(session).sessionMemory);
}

function getLastAnalysisTarget(session = {}) {
  const target = getSessionScratch(session).lastAnalysisTarget;
  if (!target || typeof target !== "object") return null;
  if (!target.path && !target.name) return null;
  return { ...target };
}

function mergeLastAnalysisTarget(session = {}, target = {}) {
  const memory = getSessionMemory(session);
  const sessionMemory = getSessionScratch(session);
  if (!target || typeof target !== "object") {
    return {
      ...memory,
      sessionMemory: {
        ...sessionMemory
      }
    };
  }
  return {
    ...memory,
    sessionMemory: {
      ...sessionMemory,
      lastAnalysisTarget: {
        path: target.path || "",
        name: target.name || "",
        mimeType: target.mimeType || "",
        ext: target.ext || "",
        updatedAt: Date.now()
      }
    }
  };
}

module.exports = {
  getLastAnalysisTarget,
  mergeLastAnalysisTarget
};
