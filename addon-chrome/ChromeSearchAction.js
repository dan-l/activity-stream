const ChromeSearchProvider = require("addon-chrome/ChromeSearchProvider");
const {dispatch} = require("addon-chrome/util");

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
 * @param {string} action.data.formHistoryUrl - Url of the form history item
 * @param {string} action.data.searchString - Search term if it's a search suggestion
 * @param {string} action.data.engineName - Name of the chosen search engine
 */
function performSearch(action) {
  const formHistoryUrl = action.data.formHistoryUrl;
  const searchString = action.data.searchString;
  const engineName = action.data.engineName;
  let url;
  if (formHistoryUrl) {
    url =  formHistoryUrl;
  } else {
    url = ChromeSearchProvider.getSearchUrl(searchString, engineName);
  }
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

module.exports = {searchSuggestions,
performSearch,
searchState,
searchUIStrings,
manageSearchEngine};
