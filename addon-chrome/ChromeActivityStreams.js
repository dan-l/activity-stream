const {CONTENT_TO_ADDON} = require("common/event-constants");
const ChromePlacesProvider = require("addon-chrome/ChromePlacesProvider");
const {dispatch} = require("addon-chrome/ChromeActionManager");

module.exports = class ChromeActivityStreams {
	constructor() {
		this._setupActionListeners();
    this._setupChromeListeners();
	}

  _setupActionListeners() {
    window.addEventListener(CONTENT_TO_ADDON, (event) => {
      const action = JSON.parse(event.detail);
      switch (action.type) {
        case "TOP_FRECENT_SITES_REQUEST":
          this._topFrecentSites(action);
          break;
        case "RECENT_BOOKMARKS_REQUEST":
          this._recentBookmarks(action);
          break;
        case "RECENT_LINKS_REQUEST":
          this._recentLinks(action);
          break;
        case "HIGHLIGHTS_LINKS_REQUEST":
          this._highlightsLinks(action);
          break;
        case "NOTIFY_HISTORY_DELETE":
          this._historyDelete(action);
          break;
        case "NOTIFY_BOOKMARK_ADD":
          this._bookmarkAdd(action);
          break;
        case "NOTIFY_BOOKMARK_DELETE":
          this._bookmarkDelete(action);
          break;
        case "NOTIFY_OPEN_WINDOW":
          this._openNewWindow(action);
          break;
      }
    }, false);
  }

  _setupChromeListeners() {
    chrome.history.onVisited.addListener((result) => {
      const row = ChromePlacesProvider.transformHistory(result);
      dispatch({
        type: "RECENT_LINKS_RESPONSE",
        data: [row],
        meta: {prepend: true}
      });
    });

    chrome.history.onVisitRemoved.addListener((result) => {
      result.urls.forEach((url) =>
        dispatch({
          type: "NOTIFY_HISTORY_DELETE",
          data: url
        })
      );
    });

    chrome.bookmarks.onCreated.addListener((id, result) => {
      const row = ChromePlacesProvider.transformBookmark(result);
      dispatch({
        type: "RECENT_BOOKMARKS_RESPONSE",
        data: [row],
        meta: {prepend: true}
      });
    });

    chrome.bookmarks.onRemoved.addListener((result) => {
      dispatch({
        type: "NOTIFY_BOOKMARK_DELETE",
        data: result
      });
    });
  }

  _topFrecentSites(action) {
    ChromePlacesProvider.getHistory().then((histories) => {
      const rows = histories.filter((result) => result.title !== "New Tab")
        .sort((a, b) => {
        if (a.count > b.count) {
          return -1; // descending
        }
        if(a.count < b.count) {
          return 1;
        }
        return 0; // must be equal
      });
      dispatch({type: "TOP_FRECENT_SITES_RESPONSE", data:rows});
    });
  }

  _recentBookmarks(action) {
    if (action.meta && action.meta.append) {
      ChromePlacesProvider.getBookmark().then((bookmarks) => {
        dispatch({
          type: "RECENT_BOOKMARKS_RESPONSE",
          data: bookmarks.filter((bookmark) => bookmark.dateAdded < action.data.beforeDate),
          meta: {append: true}
        });
      });
    } else {
      ChromePlacesProvider.getBookmark().then((bookmarks) => {
        const rows = bookmarks.sort((a, b) => {
          if (a.dateAdded > b.dateAdded) {
            return -1; // descending
          }
          if(a.dateAdded < b.dateAdded) {
            return 1;
          }
          return 0; // must be equal
        });

        dispatch({type: "RECENT_BOOKMARKS_RESPONSE", data: rows});
      });
    }
  }

  _recentLinks(action) {
    if (action.meta && action.meta.append) {
      // Since 1 day might be too small a gap if we didn't browse
      // but is 1 week the right choice?
      const aWeekAgo = action.data.beforeDate - (7 * 24 * 60 * 60 * 1000);
      ChromePlacesProvider.getHistory({startTime: aWeekAgo, endTime: action.data.beforeDate})
        .then((histories) => {
          dispatch({
            type: "RECENT_LINKS_RESPONSE",
            data: histories,
            meta: {append: true}
          });
        });
    } else {
      ChromePlacesProvider.getHistory().then((histories) => {
        dispatch({type: "RECENT_LINKS_RESPONSE", data: histories});
      });
    }
  }

  _highlightsLinks(action) {
    const bookmarkPromise = ChromePlacesProvider.getBookmark();
    const historyPromise = ChromePlacesProvider.getHistory();
    Promise.all([bookmarkPromise, historyPromise]).then((results) => {
      const rows = results.reduce((acc, result) => acc.concat(result), []);
      dispatch({type: "HIGHLIGHTS_LINKS_RESPONSE", data: rows});
    });
  }

  _historyDelete(action) {
    chrome.history.deleteUrl({url: action.data});
  }

  _bookmarkAdd(action) {
    chrome.bookmarks.create({url: action.data});
  }

  _bookmarkDelete(action) {
    chrome.bookmarks.remove(action.data);
  }

  _openNewWindow(action) {
    chrome.windows.create({url: action.data.url, incognito: action.data.isPrivate});
  }

	unload() {
		window.removeEventListener(CONTENT_TO_ADDON);
	}
};

