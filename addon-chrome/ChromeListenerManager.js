const {visitHistory, removeHistory, createBookmark, deleteBookmark}  = require("addon-chrome/actions");

module.exports = class ChromeListenerManager {
  constructor() {
    this._setupListeners();
  }

  _setupListeners() {
    this._historyVisitedListener();
    this._historyRemovedListener();
    this._bookmarkCreatedListener();
    this._bookmarkRemovedListener();
  }

  _historyVisitedListener() {
    chrome.history.onVisited.addListener((result) => visitHistory(result));
  }

  _historyRemovedListener() {
    chrome.history.onVisitRemoved.addListener((result) => removeHistory(result));
  }

  _bookmarkCreatedListener() {
    chrome.bookmarks.onCreated.addListener((id, result) => createBookmark(result));
  }

  _bookmarkRemovedListener() {
    chrome.bookmarks.onRemoved.addListener((result) => deleteBookmark(result));
  }
};
