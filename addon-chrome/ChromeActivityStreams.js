const {CONTENT_TO_ADDON} = require("common/event-constants");
const ChromePlacesProvider = require("addon-chrome/ChromePlacesProvider");
const ChromeSearchProvider = require("addon-chrome/ChromeSearchProvider");
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
        case "NOTIFY_BLOCK_URL":
          this._blockUrl(action);
          break;
        case "NOTIFY_UNBLOCK_ALL":
          this._unblockAll(action);
          break;
        case "NOTIFY_OPEN_WINDOW":
          this._openNewWindow(action);
          break;
        case "SEARCH_SUGGESTIONS_REQUEST":
          this._searchSuggestions(action);
          break;
        case "NOTIFY_PERFORM_SEARCH":
          this._performSearch(action);
          break;
        case "SEARCH_STATE_REQUEST":
          this._searchState();
          break;
        case "SEARCH_UISTRINGS_REQUEST":
          this._searchUIStrings();
          break;
      }
    }, false);
  }

  _setupChromeListeners() {
    chrome.history.onVisited.addListener((result) => {
      const row = ChromePlacesProvider.transformHistory(result);
      ChromePlacesProvider.addHistory(row).then((result) => {
        ChromePlacesProvider.getHistory().then((histories) => {
          dispatch({
            type: "RECENT_LINKS_RESPONSE",
            data: histories
          });
        });
      });
    });

    chrome.history.onVisitRemoved.addListener((result) => {
      result.urls.forEach((url) => {
        ChromePlacesProvider.removeHistory(url);
        dispatch({
          type: "NOTIFY_HISTORY_DELETE",
          data: url
        });
      });
    });

    chrome.bookmarks.onCreated.addListener((id, result) => {
      const isFolder = !result.url;
      if (isFolder) return;
      const row = ChromePlacesProvider.transformBookmark(result);
      ChromePlacesProvider.addBookmark(row);
      dispatch({
        type: "RECENT_BOOKMARKS_RESPONSE",
        data: [row],
        meta: {prepend: true}
      });
    });

    chrome.bookmarks.onRemoved.addListener((result) => {
      ChromePlacesProvider.removeBookmark(result);
      dispatch({
        type: "NOTIFY_BOOKMARK_DELETE",
        data: result
      });
    });
  }

  _topFrecentSites(action) {
    ChromePlacesProvider.getHistory().then((histories) => {
      // https://dxr.mozilla.org/mozilla-central/source/mobile/android/base/java/org/mozilla/gecko/db/BrowserContract.java#124
      // numVisits * max(1, 100 * 225 / (age*age + 225))
      const rows = histories
        .filter((hist) => !/google/.test(hist.url))
        .map((hist) => {
          const microsecondsPerDay = 86400000000;
          const age = (new Date().getTime() - hist.lastVisitDate) / microsecondsPerDay;
          return Object.assign(hist, {frencency: hist.visitCount * Math.max(1, 100 * 225 / (age * age + 225))});
        })
        .sort((a, b) => {
          if (a.frencency > b.frencency) {
            return -1;
          }
          if (a.frencency < b.frencency) {
            return 1;
          }
          return 0;
        });

      dispatch({type: "TOP_FRECENT_SITES_RESPONSE", data:rows});
    });
  }

  _recentBookmarks(action) {
    if (action.meta && action.meta.append) {
      ChromePlacesProvider.getBookmark().then((bookmarks) => {
       const rows = bookmarks
        .filter((bookmark) => bookmark.dateAdded < action.data.beforeDate);

        dispatch({
          type: "RECENT_BOOKMARKS_RESPONSE",
          data: rows,
          meta: {append: true}
        });
      });
    } else {
       ChromePlacesProvider.getBookmark().then((bookmarks) => {
         const rows = bookmarks;

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
          const rows = histories;

          dispatch({
            type: "RECENT_LINKS_RESPONSE",
            data: rows,
            meta: {append: true}
          });
        });
    } else {
      ChromePlacesProvider.getHistory()
        .then((histories) => {
          const rows = histories;

          dispatch({type: "RECENT_LINKS_RESPONSE", data: rows});
        });
    }
  }

  _highlightsLinks(action) {
      ChromePlacesProvider.getHightlights()
        .then((highlights) => {
          dispatch({type: "HIGHLIGHTS_LINKS_RESPONSE", data: highlights});
          // avoid holding up the init process
          // grab preview images asynchronously and dispatch them later
          ChromePlacesProvider.getHighlightsImg(highlights)
            .then((r) => {
              dispatch({type: "HIGHLIGHTS_LINKS_RESPONSE", data: r});
            });
        });
  }

  _blockUrl(action) {
    ChromePlacesProvider.addBlockedUrl(action.data);
  }

  _unblockAll(action) {
    ChromePlacesProvider.unblockAllUrl();
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

  _searchState() {
    const rows = ChromeSearchProvider.getEngines();
    dispatch({type: "SEARCH_STATE_RESPONSE", data: rows});
  }

  _searchSuggestions(action) {
    ChromeSearchProvider.getSuggestions(action.data.searchString)
      .then((rows) => dispatch({type: "SEARCH_SUGGESTIONS_RESPONSE", data: rows}));
  }

  _performSearch(action) {
    const searchUrl = ChromeSearchProvider.getSearchUrl(action.data.searchString, action.data.engineName);
    chrome.tabs.update({url: searchUrl});
  }

  _searchUIStrings(action) {
    const uiStrings = {
      "searchHeader": "%S Search",
      "searchForSomethingWith": "Search for %S with",
      "searchSettings": "Change Search Settings",
      "searchPlaceholder": "Search the Web"
    };
    dispatch({type: "SEARCH_UISTRINGS_RESPONSE", data: uiStrings});
  }

	unload() {
		window.removeEventListener(CONTENT_TO_ADDON);
	}
};

