const {CONTENT_TO_ADDON} = require("common/event-constants");
const {topFrecentSites,
recentBookmarks,
recentLinks,
highlightsLinks,
historyDelete,
bookmarkAdd,
bookmarkDelete,
blockUrl,
unblockAll,
openNewWindow,
searchSuggestions,
performSearch,
searchState,
searchUIStrings} = require("addon-chrome/actions");

module.exports = class ChromeActionManager {
  constructor() {
    this._setupListeners();
  }

  /**
   * Sets up listeners that responds to the actions dispatched from the content
   * and routes them to appropriate action handler
   */
  _setupListeners() {
    window.addEventListener(CONTENT_TO_ADDON, (event) => {
      const action = JSON.parse(event.detail);
      switch (action.type) {
        case "TOP_FRECENT_SITES_REQUEST":
          topFrecentSites(action);
          break;
        case "RECENT_BOOKMARKS_REQUEST":
          recentBookmarks(action);
          break;
        case "RECENT_LINKS_REQUEST":
          recentLinks(action);
          break;
        case "HIGHLIGHTS_LINKS_REQUEST":
          highlightsLinks(action);
          break;
        case "NOTIFY_HISTORY_DELETE":
          historyDelete(action);
          break;
        case "NOTIFY_BOOKMARK_ADD":
          bookmarkAdd(action);
          break;
        case "NOTIFY_BOOKMARK_DELETE":
          bookmarkDelete(action);
          break;
        case "NOTIFY_BLOCK_URL":
          blockUrl(action);
          break;
        case "NOTIFY_UNBLOCK_ALL":
          unblockAll(action);
          break;
        case "NOTIFY_OPEN_WINDOW":
          openNewWindow(action);
          break;
        case "SEARCH_SUGGESTIONS_REQUEST":
          searchSuggestions(action);
          break;
        case "NOTIFY_PERFORM_SEARCH":
          performSearch(action);
          break;
        case "SEARCH_STATE_REQUEST":
          searchState();
          break;
        case "SEARCH_UISTRINGS_REQUEST":
          searchUIStrings();
          break;
      }
    });
  }
};

