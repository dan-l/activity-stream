const ChromePreviewProvider = require("addon-chrome/ChromePreviewProvider");
const db = require("addon-chrome/db");
const {BLOCKED_URL, SEARCH_RESULT_REGEX, LOCAL_REGEX, BROWSER_RESOURCE_REGEX} = require("addon-chrome/constants");
const _ = require("lodash/collection");
const urlParse = require("url-parse");

module.exports = class ChromePlacesProvider {
  /**
   * Get a list of top frecent sites from your history
   *
   * @returns {Object} Promise that resolves with a list of top frecent sites
   */
  static topFrecentSites() {
    return new Promise((resolve) => {
      this.getHistory().then((histories) => {
        const topFrecentSites = this._getTopFrecentSites(histories);
        resolve(topFrecentSites);
      });
    });
  }

  /**
   * Get either all the bookmarks or bookmarks before a specified date
   *
   * @param {Object} options - Search options config
   * @param {Number} options.beforeDate - Only get bookmarks before this date, represented in milliseconds
   * @returns {Object} Promise that resolves with the bookmarks sorted ascendingly by the date the bookmark is added
   */
  static recentBookmarks(options) {
    return new Promise((resolve) => {
      this._getBookmarks(options).then((bookmarks) => {
        let rows = bookmarks;
        rows.sort((a, b) => {
          if (a.dateAdded > b.dateAdded) {
            return -1;
          }
          if (a.dateAdded < b.dateAdded) {
            return 1;
          }
          return 0;
        });
        resolve(rows);
      });
    });
  }

  /**
   * Get the recent history items or history items before a specified date
   *
   * @param {Object} options - Search options config
   * @param {Number} options.startTime - Only get history items visited before this date, represented in milliseconds
   * @returns {Object} Promise that resolves with histories
   */
  static recentLinks(options) {
    return new Promise((resolve) => {
      this.getHistory(options).then(resolve);
    });
  }

  /**
   * Get a list of highlights
   *
   * @returns {Object} Promise that resolves with a list of highlight items
   */
  static highlightsLinks() {
    return new Promise((resolve) => {
      this._getHighlights().then(resolve);
    });
  }

  /**
   * Proxy method to ChromePreviewProvider's removeMetadata
   *
   * @param {string} url - Item's url
   */
  static removeMetadata(url) {
    ChromePreviewProvider.removeMetadata(url);
  }

  /**
  * Proxy method to ChromePreviewProvider's cacheMetadata
  *
  * @param {Object} site - Site to get metadata for
  */
  static cacheMetadata(site) {
    ChromePreviewProvider.cacheMetadata(site);
  }

  /**
   * Add blocked urls to db
   *
   * @param {string} url - Url that is marked for block
   * @returns {Object} Promise that resolves when the db is done adding or updating
   */
  static addBlockedUrl(url) {
    return db.addOrUpdateExisting(BLOCKED_URL, {url});
  }

  /**
   * Remove blocked urls from db
   *
   * @returns {Object} Promise that resolves when the db transaction is done removing all
   */
  static unblockAllUrl() {
    return db.removeAll(BLOCKED_URL);
  }

  /**
   * Query Chrome bookmark api for a list of bookmar items with specified config
   *
   * @param {Object} options - Config object
   * @param {Number} options.beforeDate - Only get bookmarks before this date, represented in milliseconds. Defaults to today
   * @param {Number} options.maxResult - Limit to return the number of bookmarks. Defaults to 20.
   *
   * @returns {Object} Promise that resolves with bookmarks
   */
  static _getBookmarks({beforeDate = new Date().getTime(), maxResults = 20} = {}) {
    return new Promise((resolve) => {
      chrome.bookmarks.getTree((trees) => {
        let rawBookmarks = [];
        this._collectBookmarks(trees, rawBookmarks);
        const bookmarks = rawBookmarks
          .sort((a, b) => {
            if (a.dateAdded > b.dateAdded) {
              return -1;
            }
            if (a.dateAdded < b.dateAdded) {
              return 1;
            }
            return 0;
          })
          .filter((bookmark) => bookmark.dateAdded < beforeDate)
          .slice(0, maxResults)
          .map(this._transformBookmark);
        this._filterBlockedUrls(bookmarks).then(resolve);
      });
    });
  }

  /**
   * Query Chrome history api for a list of history items with specified config
   *
   * @param {Object} options - Search config
   * @param {String} options.text - Text search for history. Default to empty text
   * @param {Number} options.startTime - Only search for history visited after this time. Default to a year ago
   * @param {Number} options.endTime - Only search for history visited before this time. Default to today
   * @param {Number} options.maxResults - Maximum number of history items to return. Default to 20
   *
   * @returns {Object} Promise that resolves with histories
   */
  static getHistory(options) {
    const today = new Date().getTime();
    const aYear = 365 * 24 * 60 * 60 * 1000;
    const aYearAgo = today - aYear;
    const maxResults = 20;
    const defaultOption = {
      text: "",
      startTime: aYearAgo,
      endTime: today,
      maxResults
    };
    const searchOptions = options ? Object.assign(defaultOption, options) : defaultOption;
    const startTime = searchOptions.startTime;
    const endTime = searchOptions.endTime;
    return new Promise((resolve) => {
      chrome.history.search(searchOptions, (results) => {
        if (startTime && endTime) {
          // api uses start and end time as OR instead of AND
          // so filter it for now or we could just use this ???
          results = results.filter((result) => result.lastVisitTime > startTime && result.lastVisitTime < endTime);
        }
        this._getBookmarks()
          .then((bookmarks) => {
            const histories = results.map((result) => this._transformHistory(result, bookmarks));
            this._filterBlockedUrls(histories).then(resolve);
          });
      });
    });
  }

  /**
   * Rank history items (excluding google searches and localhost sites) by frecency score, then lastVisitTime, then url
   *
   * @param {Array} histories - List of history items
   *
   * @returns {Object} List of history items ranked by their frencency, lastVisitTime, url
   */
  static _getTopFrecentSites(histories) {
    const searchResultRegex = new RegExp(SEARCH_RESULT_REGEX);
    const localhostRegex = new RegExp(LOCAL_REGEX);
    const browserResourceRegex = new RegExp(BROWSER_RESOURCE_REGEX);
    const filterRegex = new RegExp(searchResultRegex.source + "|" + localhostRegex.source + "|" + browserResourceRegex.source);

    // Consolidate so that entries with similar hostname only show up as one entry
    const hostMap = {};
    const filteredHistories = [];
    histories.forEach((hist) => {
      const parsedUrl = urlParse(hist.url);
      const isExist = hostMap[parsedUrl.host];
      if (!isExist) {
        filteredHistories.push(hist);
        hostMap[parsedUrl.host] = true;
      }
    });

    const rows = filteredHistories
      .filter((hist) => !filterRegex.test(hist.url))
      .map((hist) => {
        const frencency = this._calculateFrecency(hist);
        return Object.assign(hist, {frencency});
      })
      .sort((a, b) => {
        if (a.frencency > b.frencency) {
          return -1;
        }
        if (a.frencency < b.frencency) {
          return 1;
        }
        if (a.lastVisitTime > b.lastVisitTime) {
          return -1;
        }
        if (a.url > b.url) {
          return -1;
        }
        return 0;
      });

    return rows;
  }

  /**
   * Calculate frecency scores a history items base on
   * https://dxr.mozilla.org/mozilla-central/source/mobile/android/base/java/org/mozilla/gecko/db/BrowserContract.java#124
   * numVisits * max(1, 100 * 225 / (age*age + 225))
   *
   * @param {Object} hist History item to calculate frecency score for
   *
   * @returns {Number} The calculated frecency for the history item
   */
  static _calculateFrecency(hist) {
    const microsecondsPerDay = 86400000000;
    const microsecondsToday = new Date().getTime() * 1000;
    const microsecondsLastVisitDate = hist.lastVisitDate * 1000;
    const age = (microsecondsToday - microsecondsLastVisitDate) / microsecondsPerDay;
    const frencency = hist.visitCount * Math.max(1, 100 * 225 / (age * age + 225));
    return frencency;
  }

  /**
   * Get a list of items from history and bookmarks that is a highlight item
   * Shuffle everytime for higher chance of getting different sets of highlights
   *
   * @returns {Object} Promise that resolves with a list of highlight items
   */
  static _getHighlights() {
    return new Promise((resolve) => {
      const bookmarkPromise = this._getBookmarks();
      const historyPromise = this.getHistory();

      Promise.all([bookmarkPromise, historyPromise]).then((results) => {
        const searchResultRegex = new RegExp(SEARCH_RESULT_REGEX);
        const localhostRegex = new RegExp(LOCAL_REGEX);
        const browserResourceRegex = new RegExp(BROWSER_RESOURCE_REGEX);
        const filterRegex = new RegExp(searchResultRegex.source + "|" + localhostRegex.source + "|" + browserResourceRegex.source);

        const bookmarks = results[0].filter((bookmarks) => !filterRegex.test(bookmarks.url));
        const histories = results[1].filter((hist) => !filterRegex.test(hist.url));

        const rows = bookmarks.concat(histories)
          .filter((item) => this._isHighlightItem(item));

        const shuffledRows = _.shuffle(rows);

        ChromePreviewProvider.getLinksMetadataForHighlights(shuffledRows)
          .then(resolve);
      });
    });
  }

  /**
   * Determine whether highlight satifies highlight criteria:
   * 1) Visited at least 30 minutes ago or have been added more than 3 days ago
   * 2) Visited at most 3 times
   *
   * @param {Object} item - Item to check highlight criteria against
   * @returns {Boolean} True if item satisify criteria to be a highlight item, false otherwise
   */
  static _isHighlightItem(item) {
    const threeDays = 3 * 24 * 60 * 60 * 1000;
    const thirtyMinutes = 30 * 60 * 1000;
    const today = new Date().getTime();
    const lastVisitDate = item.lastVisitDate;
    const dateAdded = item.dateAdded;
    let isThreeDaysOrOlder;
    let isThirtyMinutesOrOlder;
    if (dateAdded) {
      isThreeDaysOrOlder = today - dateAdded > threeDays;
    } else if (lastVisitDate) {
      isThirtyMinutesOrOlder = today - lastVisitDate > thirtyMinutes;
    }

    const isVisitCountAtMostThree = (item.visitCount || 0) <= 3;

    return (isThirtyMinutesOrOlder || isThreeDaysOrOlder) && isVisitCountAtMostThree;
  }

  /**
   * Filters out the blocked urls from a list of items
   *
   * @param {Array} items - List of items that needs to be filtered
   * @returns {Object} Promise that resolves with a list of urls that are not in the blocked list
   */
  static _filterBlockedUrls(items) {
    return new Promise((resolve) => {
      db.getAll(BLOCKED_URL)
        .then((blockedUrlItems) => {
          const blockedUrls = blockedUrlItems.map((blocked) => blocked.url);
          const nonBlockedUrls = items.filter((item) => blockedUrls.indexOf(item.url) === -1);
          resolve(nonBlockedUrls);
        });
    });
  }

  /**
   * Transform a raw history bookmark item into activity stream's history item,
   * merge the history item with the bookmark item that shares its url if it hasn't and merge its metadata
   *
   * @param {Object} hist - History item to be transformed
   * @param {Object} bookmarks - List of bookmarks
   * @returns {Object} Promise that resolves with the history item has been transformed
   */
  static _transformHistory(hist, bookmarks) {
    const mergedHist = this._mergeHistoryBookmark(hist, bookmarks);
    Object.assign(mergedHist, {
      favicon_url: "chrome://favicon/size/16@2x/" + hist.url,
      lastVisitDate: parseInt(hist.lastVisitTime, 10)
    });
    return mergedHist;
  }

  /**
   * Transform a raw chrome bookmark item into activity stream's bookmark item and merge its metadata
   *
   * @param {Object} bookmark - Bookmark to be transformed
   * @returns {Object} Promise that resolves with the bookmark has been transformed
   */
  static _transformBookmark(bookmark) {
    Object.assign(bookmark, {
      favicon_url: "chrome://favicon/" + bookmark.url,
      bookmarkDateCreated: bookmark.dateAdded,
      bookmarkGuid: bookmark.id
    });
    return bookmark;
  }

  /**
   * Recursively traverse the tree of bookmarks and store only bookmark links in an array
   *
   * @param {Array} trees - Root of a Chrome bookmark tree item
   * @param {Array} bookmarks - List of bookmarks accumulated by traversing the tree
   */
  static _collectBookmarks(trees, bookmarks) {
    trees.forEach((tree) => {
      const isBookmarkLink = !!tree.url;
      if (isBookmarkLink) {
        bookmarks.push(tree);
      }

      const hasMoreBookmarks = !!tree.children;
      if (hasMoreBookmarks) {
        this._collectBookmarks(tree.children, bookmarks);
      }
    });
  }

  /**
   * Merge a history item and a bookmark item that shares the same url into a single item
   *
   * @param {Object} hist - History item
   * @param {Array} bookmarks - List of bookmarks
   * @returns {Object} The merged history and bookmark item if they share the same url
   */
  static _mergeHistoryBookmark(hist, bookmarks) {
    const bookmarkUrls = bookmarks.map((bookmark) => bookmark.url);
    const index = bookmarkUrls.indexOf(hist.url);
    if (index > -1) {
      Object.assign(hist, {bookmarkGuid: bookmarks[index].bookmarkGuid});
    }
    return hist;
  }
};
