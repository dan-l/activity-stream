const {ADDON_TO_CONTENT} = require("common/event-constants");

function dispatch(action) {
  window.dispatchEvent(
    new CustomEvent(ADDON_TO_CONTENT, {detail: action})
  );
}

module.exports = {
	dispatch
}