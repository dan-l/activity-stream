const {ADDON_TO_CONTENT} = require("common/event-constants");

/**
 * Dispatch an action from addon to content
 *
 * @param {Object} action - Action config
 */
function dispatch(action) {
  window.dispatchEvent(
    new CustomEvent(ADDON_TO_CONTENT, {detail: action})
  );
}

module.exports = {
  dispatch
};
