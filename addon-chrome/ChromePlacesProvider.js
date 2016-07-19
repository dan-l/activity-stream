const db = require("addon-chrome/db");
const {BLOCKED_URL, METADATA} = require("addon-chrome/constants");

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
      this._getBookmark(options).then((bookmarks) => {
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
   * Remove item from metadata cache
   *
   * @param {string} url - Item's url
   */
  static removeMetadata(url) {
    db.remove(METADATA, url);
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
   * @param {Object} options - Config object for @{link _collectBookmarks}
   *
   * @returns {Object} Promise that resolves with bookmarks
   */
  static _getBookmark(options) {
    return new Promise((resolve) => {
      chrome.bookmarks.getTree((trees) => {
        let rawBookmarks = [];
        this._collectBookmarks(trees, rawBookmarks, options);
        const bookmarks = rawBookmarks.map(this._transformBookmark);
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
        this._getBookmark()
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
   * @returns {Object} Promise that resolves with list of history items ranked by their frencency, lastVisitTime, url
   */
  static _getTopFrecentSites(histories) {
    return new Promise((resolve) => {
      const rows = histories
        .filter((hist) => !/(google|localhost)/.test(hist.url))
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

      resolve(rows);
    });
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
    const age = (new Date().getTime() - hist.lastVisitDate) / microsecondsPerDay;
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
      const bookmarkPromise = this._getBookmark();
      const historyPromise = this.getHistory();

      Promise.all([bookmarkPromise, historyPromise]).then((results) => {
        const bookmarks = results[0].filter((bookmarks) => !/(google|localhost)/.test(bookmarks.url));
        const histories = results[1].filter((hist) => !/(google|localhost)/.test(hist.url));

        const rows = bookmarks.concat(histories)
          .filter((item) => this._isHighlightItem(item));

        const shuffledRows = this._shuffle(rows);
        resolve(shuffledRows);
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
    const isValidLinks = !/(google|localhost)/.test(item.url);

    return isValidLinks && (isThirtyMinutesOrOlder || isThreeDaysOrOlder) && isVisitCountAtMostThree;
  }

  /**
   * Fisher-Yates In-place O(n) shuffle
   * Pick a random remaining element (from the front) and place in its new location (in the back)
   * The unshuffled element in the back is swapped to the front, where it waits for subsequent shuffling
   * https://bost.ocks.org/mike/shuffle/
   *
   * @param {Array} array - The array of items to shuffle
   *
   * @returns {Array} The shuffled array
   */
  static _shuffle(array) {
    let arrayLen = array.length;
    let temp;
    let index;

    // While there remain elements to shuffle…
    while (arrayLen) {
      // Pick a remaining element…
      index = Math.floor(Math.random() * arrayLen--);
      // And swap it with the current element.
      temp = array[arrayLen];
      array[arrayLen] = array[index];
      array[index] = temp;
    }

    return array;
  }

  /**
   * Filters out the blocked urls from a list of item
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
   * merge the history item with the bookmark item that shares it's url if it hasn't and merge it's metadata
   *
   * @param {Object} hist - History item to be transformed
   * @param {Object} bookmarks - List of bookmarks
   * @returns {Object} Promise that resolves with the history item has been transformed
   */
  static _transformHistory(hist, bookmarks) {
    const mergedHist = this._mergeHistoryBookmark(hist, bookmarks);
    Object.assign(mergedHist, {
      favicon_url: "chrome://favicon/" + hist.url,
      lastVisitDate: parseInt(hist.lastVisitTime, 10)
    });
    return mergedHist;
  }

  /**
   * Transform a raw chrome bookmark item into activity stream's bookmark item and merge it's metadata
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
   * @param {Object} options - Config object
   * @param {Number} options.beforeDate - Only get bookmarks before this date, represented in milliseconds. Default to today
   * @param {Number} options.maxResult - Limit to return the number of bookmarks. Default to 20.
   */
  static _collectBookmarks(trees, bookmarks, {beforeDate = new Date().getTime(), maxResults = 20} = {}) {
    trees.forEach((tree) => {
      const hasExceededMaxResults = bookmarks.length >= maxResults;
      if (hasExceededMaxResults) {
        return;
      }

      const isBookmarkLink = !!tree.url;
      const isAddedBeforeDate = tree.dateAdded < beforeDate;
      if (isBookmarkLink && isAddedBeforeDate) {
        bookmarks.push(tree);
      }

      const hasMoreBookmarks = !!tree.children;
      if (hasMoreBookmarks) {
        this._collectBookmarks(tree.children, bookmarks, {beforeDate, maxResults});
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
