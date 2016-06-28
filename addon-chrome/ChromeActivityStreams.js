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
      }
    }, false);
  }

  _setupChromeListeners() {
    chrome.history.onVisited.addListener((result) => {
      ChromePlacesProvider.transformHistory(result).then((row) => {
        ChromePlacesProvider.addHistory(row).then((result) => {
          ChromePlacesProvider.getHistory().then((histories) => {
            dispatch({
              type: "RECENT_LINKS_RESPONSE",
              data: histories
            });
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
      chrome.topSites.get((results) => {
        const topUrls = results.map((r) => r.url);
        const rows = histories
          .filter((hist) => topUrls.indexOf(hist.url) > -1);
        dispatch({type: "TOP_FRECENT_SITES_RESPONSE", data:rows});
      });
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
    const bookmarkPromise = ChromePlacesProvider.getBookmark();
    const historyPromise = ChromePlacesProvider.getHistory();
    const threeDays = 3 * 24 * 60 * 60 * 1000;
    Promise.all([bookmarkPromise, historyPromise]).then((results) => {
      const rows = results
        .reduce((acc, result) => acc.concat(result), [])
        .filter((r) =>
          ((new Date().getTime() - r.lastVisitDate) > threeDays) &&
          r.visitCount <= 3);

      dispatch({type: "HIGHLIGHTS_LINKS_RESPONSE", data: rows});
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

  _searchSuggestions(action) {
    // TODO improve with fuzzy search
    const suggestionLength = 6;
    const searchString = action.data.searchString;

    ChromePlacesProvider.getHistory()
      .then((histories) => {
        const nonDupHistTitle = histories
          .map((hist) => hist.title)
          .filter((title, index, array) => array.indexOf(title) === index);
        const formHistory = nonDupHistTitle
          .filter((title) => title.toLowerCase().startsWith(action.data.searchString))
          .slice(0, suggestionLength);

          dispatch({
            type: "SEARCH_SUGGESTIONS_RESPONSE",
            data: {
              suggestions: [searchString],
              formHistory,
              searchString
            }
          });
      });
  }

  _performSearch(action) {
    // TODO need to figure out browser mechanics of directing to browser's default search page
    const searchUrl = "https://www.google.ca/search?q=";
    const searchTerm = action.data.searchString.replace(/\s/g, "+");

    chrome.tabs.create({url: searchUrl + searchTerm});
  }

	unload() {
		window.removeEventListener(CONTENT_TO_ADDON);
	}
};

