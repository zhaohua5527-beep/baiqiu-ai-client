const UI_STATES = Object.freeze({
  IDLE: "idle",
  THINKING: "thinking",
  PLANNING: "planning",
  EXECUTING: "executing",
  VERIFYING: "verifying",
  COMPLETED: "completed",
  FAILED: "failed"
});

const STAGE_TO_UI_STATE = Object.freeze({
  received: UI_STATES.IDLE,
  understanding: UI_STATES.THINKING,
  planning: UI_STATES.PLANNING,
  executing: UI_STATES.EXECUTING,
  verifying: UI_STATES.VERIFYING,
  completed: UI_STATES.COMPLETED,
  failed: UI_STATES.FAILED
});

class UIStateManager {
  constructor(initialState = UI_STATES.IDLE) {
    this.state = initialState;
    this.history = [];
  }

  transition(nextState, meta = {}) {
    const state = Object.values(UI_STATES).includes(nextState) ? nextState : UI_STATES.IDLE;
    this.state = state;
    this.history.push({ state, meta, at: new Date().toISOString() });
    return this.snapshot();
  }

  fromTaskExperience(experience = {}) {
    return this.transition(STAGE_TO_UI_STATE[experience.currentStage] || UI_STATES.IDLE, {
      taskId: experience.taskId || "",
      progress: experience.progress || 0,
      message: experience.message || ""
    });
  }

  snapshot() {
    return {
      state: this.state,
      history: [...this.history]
    };
  }
}

module.exports = { UIStateManager, UI_STATES, STAGE_TO_UI_STATE };
