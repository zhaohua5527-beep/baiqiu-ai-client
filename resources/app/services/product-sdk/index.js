const { ProductSDK, DEFAULT_PRODUCT_DATA_ROOT } = require("./product-sdk");
const { ProductEventAdapter } = require("./product-event-adapter");
const { UIAdapter } = require("./ui-adapter");
const { TaskExperience, STAGE_LABELS, STAGE_PROGRESS } = require("./task-experience");
const { UIStateManager, UI_STATES, STAGE_TO_UI_STATE } = require("./ui-state-manager");

function createProductSDK(options = {}) {
  return new ProductSDK(options);
}

module.exports = {
  ProductSDK,
  ProductEventAdapter,
  UIAdapter,
  TaskExperience,
  UIStateManager,
  STAGE_LABELS,
  STAGE_PROGRESS,
  UI_STATES,
  STAGE_TO_UI_STATE,
  DEFAULT_PRODUCT_DATA_ROOT,
  createProductSDK
};
