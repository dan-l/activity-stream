const ChromePlacesProvider = require("addon-chrome/ChromePlacesProvider");
const ChromeSearchProvider = require("addon-chrome/ChromeSearchProvider");
const {ADDON_TO_CONTENT} = require("common/event-constants");
const {SEARCH_HEADER,
SEARCH_FOR_SOMETHING,
SEARCH_SETTINGS,
SEARCH_PLACEHOLDER} = require("addon-chrome/constants");

/**
 * Respond with top frencent sites
 */
function topFrecentSites() {
  ChromePlacesProvider.topFrecentSites()
    .then((data) => dispatch({type: "TOP_FRECENT_SITES_RESPONSE", data}));
}

/**
 * Respond with all the bookmarks or boomarks before specified date
 *
 * @param {Object} action - Action config
 * @param {Object} action.meta - Metadata config associated with the action
 * @param {boolean} action.meta.append - Boolean flag indicating whether to append the new results to old
 * @param {Object} action.data - Data config associated with the action
 * @param {number} action.data.beforeDate - Limit results to before this date, represented in milliseconds
 */
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

/**
 * Respond with histories as far back as a year or histories before specified date
 *
 * @param {Object} action - Action config
 * @param {Object} action.meta - Metadata config associated with the action
 * @param {boolean} action.meta.append - Boolean flag indicating whether to append the new results to old
 * @param {Object} action.data - Data config associated with the action
 * @param {number} action.data.beforeDate - Limit results to before this date, represented in milliseconds
 */
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

/**
 * Respond with highlights chosen from histories and bookmarks while asynchronously fetching their preview images
 */
function highlightsLinks() {
  ChromePlacesProvider.highlightsLinks()
      .then((highlights) => {
        dispatch({type: "HIGHLIGHTS_LINKS_RESPONSE", data: highlights});
        // avoid holding up the init process
        // grab preview images asynchronously and dispatch them later
        ChromePlacesProvider.getHighlightsImg(highlights)
          .then((higlightsWithImgs) => {
            dispatch({type: "HIGHLIGHTS_LINKS_RESPONSE", data: higlightsWithImgs});
          });
      });
}

/**
 * Remembers an url that is marked as blocked
 *
 * @param {Object} action - Action config
 * @param {string} action.data - The blocked url
 */
function blockUrl(action) {
  ChromePlacesProvider.addBlockedUrl(action.data);
}

/**
 * Unblocks all previously blocked urls
 */
function unblockAll() {
  ChromePlacesProvider.unblockAllUrl();
}

/**
 * Delete history with specified url from Chrome browser
 *
 * @param {Object} action - Action config
 * @param {string} action.data - The url of the history item to be deleted
 */
function historyDelete(action) {
  chrome.history.deleteUrl({url: action.data});
}

/**
 * Create a new bookmark from Chrome browser
 *
 * @param {Object} action - Action config
 * @param {string} action.data - The url of the newly created bookmark
 */
function bookmarkAdd(action) {
  chrome.bookmarks.create({url: action.data});
}

/**
 * Delete a bookmark with specified url from Chrome browser
 *
 * @param {Object} action - Action config
 * @param {string} action.data - The url of the bookmark item to be deleted
 */
function bookmarkDelete(action) {
  chrome.bookmarks.remove(action.data);
}

/**
 * Open a link either in a new regular window or an incognito window from Chrome browser
 *
 * @param {Object} action - Action config
 * @param {Object} action.data - Data config associated with the action
 * @param {string} action.data.url - Url of the link to be opened
 * @param {boolean} action.data.incognito - Boolean flag indicating whether to open link in a new private window
 */
function openNewWindow(action) {
  chrome.windows.create({url: action.data.url, incognito: action.data.isPrivate});
}

/**
 * Respond with the search engines config
 */
function searchState() {
  const data = ChromeSearchProvider.getEngines();
  dispatch({type: "SEARCH_STATE_RESPONSE", data});
}

/**
 * Respond with search suggestions for a given search term
 *
 * @param {Object} action - Action config
 * @param {Object} action.data - Data config
 * @param {string} action.data.searchString - Search term
 */
function searchSuggestions(action) {
  ChromeSearchProvider.getSuggestions(action.data.searchString)
    .then((data) => dispatch({type: "SEARCH_SUGGESTIONS_RESPONSE", data}));
}

/**
 * Navigate to the link for the chosen search result in Chrome browser
 *
 * @param {Object} action - Action config
 * @param {Object} action.data - Data config
 * @param {string} action.data.searchString - Search term
 * @param {string} action.data.engineName - Name of the chosen search engine
 */
function performSearch(action) {
  const searchUrl = ChromeSearchProvider.getSearchUrl(action.data.searchString, action.data.engineName);
  chrome.tabs.update({url: searchUrl});
}

/**
 * Respond with the ui strings for the search interface
 */
function searchUIStrings() {
  const uiStrings = {
    "searchHeader": SEARCH_HEADER,
    "searchForSomethingWith": SEARCH_FOR_SOMETHING,
    "searchSettings": SEARCH_SETTINGS,
    "searchPlaceholder": SEARCH_PLACEHOLDER
  };
  dispatch({type: "SEARCH_UISTRINGS_RESPONSE", data: uiStrings});
}

/**
 * Respond with the newly added history items
 */
function visitHistory() {
  ChromePlacesProvider.getHistory().then((histories) => {
    dispatch({
      type: "RECENT_LINKS_RESPONSE",
      data: histories
    });
  });
}

/**
 * Respond with the delete history item's url for each deleted history item
 *
 * @param {Object} result - Result for deleting history request
 * @param {Array} result.urls - Urls for history items to be deleted
 */
function removeHistory(result) {
  result.urls.forEach((url) => {
    dispatch({
      type: "NOTIFY_HISTORY_DELETE",
      data: url
    });
  });
}

/**
 * Respond with the newly created bookmarks
 *
 * @param {Object} result - Result for creating bookmark request
 * @param {string} result.url - Url for the newly created bookmark
 */
function createBookmark(result) {
  const isFolder = !result.url;
  if (isFolder) {
    return;
  }
  dispatch({
    type: "RECENT_BOOKMARKS_RESPONSE",
    data: [result],
    meta: {prepend: true}
  });
}

/**
 * Respond with the deleted bookmark id
 *
 * @param {string} data - Id of the bookmark to be deleted
 */
function deleteBookmark(data) {
  dispatch({
    type: "NOTIFY_BOOKMARK_DELETE",
    data
  });
}

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
searchUIStrings,
visitHistory,
removeHistory,
createBookmark,
deleteBookmark};
