const ChromeActionManager = require("addon-chrome/ChromeActionManager");
const ChromeListenerManager = require("addon-chrome/ChromeListenerManager");

module.exports = class ChromeActivityStreams {
  constructor() {
    new ChromeActionManager();
    new ChromeListenerManager();
  }
};

