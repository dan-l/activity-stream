const ChromePlacesProvider = require("addon-chrome/ChromePlacesProvider");
const ChromeSearchProvider = require("addon-chrome/ChromeSearchProvider");
const {ADDON_TO_CONTENT} = require("common/event-constants");

function topFrecentSites(action) {
  ChromePlacesProvider.topFrecentSites()
    .then((data) => dispatch({type: "TOP_FRECENT_SITES_RESPONSE", data}));
}

function recentBookmarks(action) {
  if (action.meta && action.meta.append) {
    ChromePlacesProvider.recentBookmarks(action.data)
      .then((data) =>  dispatch({
        type: "RECENT_BOOKMARKS_RESPONSE",
        data,
        meta: {append: true}
      }));
  } else {
      ChromePlacesProvider.recentBookmarks()
       .then((data) => dispatch({type: "RECENT_BOOKMARKS_RESPONSE", data}));
  }
}

function recentLinks(action) {
  if (action.meta && action.meta.append) {
    ChromePlacesProvider.recentLinks(action.data)
      .then((data) =>
        dispatch({
          type: "RECENT_LINKS_RESPONSE",
          data,
          meta: {append: true}
        }));
  } else {
    ChromePlacesProvider.recentLinks()
      .then((data) => dispatch({type: "RECENT_LINKS_RESPONSE", data}));
  }
}

function highlightsLinks(action) {
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

function blockUrl(action) {
  ChromePlacesProvider.addBlockedUrl(action.data);
}

function unblockAll(action) {
  ChromePlacesProvider.unblockAllUrl();
}

function historyDelete(action) {
  chrome.history.deleteUrl({url: action.data});
}

function bookmarkAdd(action) {
  chrome.bookmarks.create({url: action.data});
}

function bookmarkDelete(action) {
  chrome.bookmarks.remove(action.data);
}

function openNewWindow(action) {
  chrome.windows.create({url: action.data.url, incognito: action.data.isPrivate});
}

function searchState() {
  const data = ChromeSearchProvider.getEngines();
  dispatch({type: "SEARCH_STATE_RESPONSE", data});
}

function searchSuggestions(action) {
  ChromeSearchProvider.getSuggestions(action.data.searchString)
    .then((data) => dispatch({type: "SEARCH_SUGGESTIONS_RESPONSE", data}));
}

function performSearch(action) {
  const searchUrl = ChromeSearchProvider.getSearchUrl(action.data.searchString, action.data.engineName);
  chrome.tabs.update({url: searchUrl});
}

function searchUIStrings(action) {
  const uiStrings = {
    "searchHeader": "%S Search",
    "searchForSomethingWith": "Search for %S with",
    "searchSettings": "Change Search Settings",
    "searchPlaceholder": "Search the Web"
  };
  dispatch({type: "SEARCH_UISTRINGS_RESPONSE", data: uiStrings});
}

function visitHistory(result) {
  const row = ChromePlacesProvider.transformHistory(result);
  ChromePlacesProvider.addHistory(row).then((result) => {
    ChromePlacesProvider.getHistory().then((histories) => {
      dispatch({
        type: "RECENT_LINKS_RESPONSE",
        data: histories
      });
    });
  });
}

function removeHistory(result) {
  result.urls.forEach((url) => {
    ChromePlacesProvider.removeHistory(url);
    dispatch({
      type: "NOTIFY_HISTORY_DELETE",
      data: url
    });
  });
}

function createBookmark(result) {
  const isFolder = !result.url; if (isFolder) return;
  const row = ChromePlacesProvider.transformBookmark(result);
  ChromePlacesProvider.addBookmark(row);
  dispatch({
    type: "RECENT_BOOKMARKS_RESPONSE",
    data: [row],
    meta: {prepend: true}
  });
}

function deleteBookmark(result) {
  ChromePlacesProvider.removeBookmark(result);
  dispatch({
    type: "NOTIFY_BOOKMARK_DELETE",
    data: result
  });
}

function dispatch(action) {
  window.dispatchEvent(
    new CustomEvent(ADDON_TO_CONTENT, {detail: action})
  );
}

module.exports = {topFrecentSites,
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
searchUIStrings};
