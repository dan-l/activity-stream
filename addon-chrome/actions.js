const ChromePlacesProvider = require("addon-chrome/ChromePlacesProvider");
const ChromeSearchProvider = require("addon-chrome/ChromeSearchProvider");
const ChromePreviewProvider = require("addon-chrome/ChromePreviewProvider");
const {ADDON_TO_CONTENT} = require("common/event-constants");

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
  if (action && action.meta && action.meta.append) {
    const beforeDate = action.data.beforeDate;
    ChromePlacesProvider.recentBookmarks({beforeDate})
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
  if (action && action.meta && action.meta.append) {
    const endTime = action.data.beforeDate;
    ChromePlacesProvider.recentLinks({endTime})
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
      ChromePreviewProvider.getLinksMetadata(highlights)
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
 * Respond with the url for each deleted history item from Chrome browser
 *
 * @param {Object} action - Result for deleting history request
 * @param {Array} action.urls - Urls for history items to be deleted
 */
function removeHistory(action) {
  action.urls.forEach((url) => {
    ChromePlacesProvider.removeMetadata(url);
    dispatch({
      type: "NOTIFY_HISTORY_DELETE",
      data: url
    });
  });
}

/**
 * Respond with the newly added history items from Chrome browser
 *
 * @param {Object} action - Newly added history item
 * @param {string} action.url - Url fo the newly added history item
 */
function visitHistory(action) {
  const url = action.url;
  ChromePreviewProvider.cacheMetadata({url});
  recentLinks();
}

/**
 * Respond with the newly created bookmarks from Chrome browser
 *
 * @param {Object} action - Result for creating bookmark request
 * @param {string} action.url - Url for the newly created bookmark
 */
function createBookmark(action) {
  const isFolder = !action.url;
  if (isFolder) {
    return;
  }
  dispatch({
    type: "RECENT_BOOKMARKS_RESPONSE",
    data: [action],
    meta: {prepend: true}
  });
}

/**
 * Respond with the deleted bookmark id from Chrome browser
 *
 * @param {string} action - Id of the bookmark to be deleted
 */
function deleteBookmark(action) {
  dispatch({
    type: "NOTIFY_BOOKMARK_DELETE",
    data: action
  });
}

/**
 * Delete history with specified url from content
 *
 * @param {Object} action - Action config
 * @param {string} action.data - The url of the history item to be deleted
 */
function historyDelete(action) {
  const url = action.data;
  chrome.history.deleteUrl({url});
  ChromePlacesProvider.removeMetadata(url);
  dispatch({
    type: "NOTIFY_HISTORY_DELETE",
    data: url
  });
}

/**
 * Create a new bookmark from content
 *
 * @param {Object} action - Action config
 * @param {string} action.data - The url of the newly created bookmark
 */
function bookmarkAdd(action) {
  const url = action.data.url;
  const title = action.data.title;
  chrome.bookmarks.create({url, title});
  ChromePlacesProvider.recentBookmarks({maxResults: 1})
    .then((data) =>  dispatch({
      type: "RECENT_BOOKMARKS_RESPONSE",
      data,
      meta: {append: true}
    }));
}

/**
 * Delete a bookmark with specified url from content
 *
 * @param {Object} action - Action config
 * @param {string} action.data - The url of the bookmark item to be deleted
 */
function bookmarkDelete(action) {
  const data = action.data;
  chrome.bookmarks.remove(data);
  ChromePlacesProvider.removeMetadata(data);
  dispatch({
    type: "NOTIFY_BOOKMARK_DELETE",
    data
  });
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
  const url = action.data.url;
  const incognito = action.data.isPrivate;
  chrome.windows.create({url, incognito});
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
  const searchString = action.data.searchString;
  ChromeSearchProvider.getSuggestions(searchString)
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
  const searchString = action.data.searchString;
  const engineName = action.data.engineName;
  const url = ChromeSearchProvider.getSearchUrl(searchString, engineName);
  chrome.tabs.update({url});
}

/**
 * Respond with the ui strings for the search interface
 */
function searchUIStrings() {
  const data = ChromeSearchProvider.getUiStrings();
  dispatch({type: "SEARCH_UISTRINGS_RESPONSE", data});
}

/**
 * Opens the search preference page for Chrome browser
 */
function manageSearchEngine() {
  const url = ChromeSearchProvider.getSearchPreferencePage();
  chrome.tabs.update({url});
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
deleteBookmark,
manageSearchEngine};
