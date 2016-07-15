const db = require("addon-chrome/db");
const {BLOCKED_URL, METADATA, HISTORY, LAST_VISIT_TIME} = require("addon-chrome/constants");

module.exports = class ChromePlacesProvider {
  /**
   * Calculate frecency scores for each history items (except google searches) base on
   * https://dxr.mozilla.org/mozilla-central/source/mobile/android/base/java/org/mozilla/gecko/db/BrowserContract.java#124
   * numVisits * max(1, 100 * 225 / (age*age + 225))
   *
   * @returns {Object} Promise that resolves with a list of items that is sorted descendingly by it's frecency score
   */
  static topFrecentSites() {
    const promise = new Promise((resolve, reject) => {
      this.getHistory({isSkipCache: true}).then((histories) => {
        const rows = histories
          .filter((hist) => !/(google|localhost)/.test(hist.url))
          .map((hist) => {
            const microsecondsPerDay = 86400000000;
            const age = (new Date().getTime() - hist.lastVisitDate) / microsecondsPerDay;
            const frencency = hist.visitCount * Math.max(1, 100 * 225 / (age * age + 225));
            return Object.assign(hist, {frencency});
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

        resolve(rows);
      });
    });

    return promise;
  }

  /**
   * Get either all the bookmarks or bookmarks before a specified date
   *
   * @param {Object} options - Search options config
   * @param {string} options.beforeDate - Limit results to before this date, represented in milliseconds
   * @returns {Object} Promise that resolves with the bookmarks sorted ascendingly by the date the bookmark is added
   */
  static recentBookmarks(options) {
    const promise = new Promise((resolve, reject) => {
      this.getBookmark().then((bookmarks) => {
        let rows = bookmarks;
        if (options && options.beforeDate) {
          rows = bookmarks.filter((bookmark) => bookmark.dateAdded < options.beforeDate);
        }
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

    return promise;
  }

  /**
   * Get either all the histories or histoires before a specified date
   *
   * @param {Object} options - Search options config
   * @param {string} options.beforeDate - Limit results to before this date, represented in milliseconds
   * @returns {Object} Promise that resolves with histories
   */
  static recentLinks(options) {
    const promise = new Promise((resolve, reject) => {
      let searchParam;
      if (options && options.beforeDate) {
        searchParam = {
          endTime: options.beforeDate
        };
      }

      this.getHistory({searchParam}).then(resolve);
    });

    return promise;
  }

  /**
   * Get a list of items that are not google searches as highlights if they:
   * 1) Haven't been visited for more than 3 days
   * 2) Visited at most 3 times
   *
   * @returns {Object} Promise that resolves with a list of highlight items
   */
  static highlightsLinks() {
    const promise = new Promise((resolve, reject) => {
      const bookmarkPromise = this.getBookmark();
      const threeDays = 3 * 24 * 60 * 60 * 1000;
      const today = new Date().getTime();
      const threeDaysAgo = today - threeDays;
      const historyPromise = this.getHistory({endTime: threeDaysAgo, isGetAll: true});

      Promise.all([bookmarkPromise, historyPromise]).then((results) => {
        const bookmarks = results[0];
        const histories = results[1].filter((hist) => !/(google|localhost)/.test(hist.url));

        const rows = bookmarks.concat(histories)
          .filter((r, index) => {
            const isThreeDaysOrOlder = (today - (r.lastVisitDate || r.dateAdded)) > threeDays;
            const isVisitCountAtMostThree = (r.visitCount || 0) <= 3;
            return isThreeDaysOrOlder && isVisitCountAtMostThree;
          });

        resolve(rows);
      });
    });

    return promise;
  }

  /**
   * Query Chrome bookmark api for all the bookmarks and transform them into activity stream bookmark items
   *
   * @returns {Object} Promise that resolves with bookmarks
   */
  static getBookmark() {
    const promise = new Promise((resolve, reject) => {
      chrome.bookmarks.getTree((trees) => {
        const rawBookmarks = [];
        this._collectBookmarks(trees, rawBookmarks);
        const transformPromises = rawBookmarks
          .filter((bookmark) => !!bookmark.url)
          .map(this.transformBookmark);

        Promise.all(transformPromises)
          .then((bookmarks) => this._filterBlockedUrls(bookmarks).then(resolve));
      });
    });

    return promise;
  }

  /**
   * If history is cached, return cached history. Otherwise,
   * query Chrome history api for history, cache it and transform them into activity stream history items
   * Default to 100 max results, page if require complete history
   *
   * @param {Object} options - Get history options config
   * @param {Object} options.searchParam - Chrome history api search params
   * @param {boolean} options.isGetAll - Flag indicating to get all history
   * @param {boolean} options.isSkipCache - Flag indicating to query straight from api
   * @returns {Object} Promise that resolves with histories
   */
  static getHistory(options) {
    const today = new Date().getTime();
    const aYear = 365 * 24 * 60 * 60 * 1000;
    const aYearAgo = today - aYear;
    const defaultOption = {
      text: "",
      startTime: aYearAgo,
      endTime: today
    };
    const searchOptions = options ? Object.assign(defaultOption, options.searchParam) : defaultOption;
    const startTime = searchOptions.startTime;
    const endTime = searchOptions.endTime;
    if (this._isHistoryCached() && !options.isSkipCache) {
      let dbOptions;
      let dbHistoryFn;
      if (options.isGetAll) {
        dbOptions = {
          index: LAST_VISIT_TIME,
          direction: "prev"
        };
        dbHistoryFn = db.getAll;
      } else {
        dbOptions = {
          index: LAST_VISIT_TIME,
          direction: "prev",
          compareFn: (slice) => { return slice.lastVisitTime > startTime && slice.lastVisitTime < endTime;}
        };
        dbHistoryFn = db.getSlice;
      }
      return new Promise((resolve, reject) => {
        dbHistoryFn.call(db, HISTORY, dbOptions)
          .then((histories) => this._filterBlockedUrls(histories).then(resolve));
      });
    }
    const promise = new Promise((resolve, reject) => {
      chrome.history.search(searchOptions, (results) => {
        if (startTime && endTime) {
          // api uses start and end time as OR instead of AND
          // so filter it for now or we could just use this ???
          results = results.filter((result) => result.lastVisitTime > startTime && result.lastVisitTime < endTime);
        }

        this.getBookmark()
          .then((bookmarks) => {
            const transformPromises = results.map((result) => this.transformHistory(result, bookmarks));
            Promise.all(transformPromises)
             .then((histories) => {
               this._cacheHistory(histories, searchOptions);
               this._filterBlockedUrls(histories).then(resolve);
             });
          });
      });
    });

    return promise;
  }

  static removeHistory(histurl) {
    db.remove(HISTORY, histurl);
    db.remove(METADATA, histurl);
  }

  static _initHistoryCache() {
    window.localStorage.setItem("cache", true);
  }

  static _isHistoryCacheInit() {
    return window.localStorage.getItem("cache") !== null;
  }

  static _isHistoryCached(time) {
    return window.localStorage.getItem("init") !== null;
  }

  static _cacheHistory(histories, searchOptions) {
    histories.forEach((hist) => db.addOrUpdateExisting(HISTORY, hist));
    if (this._isHistoryCacheInit()) {
      // already started caching history, one copy is enough !
      return;
    } else {
      this._initHistoryCache();
    }
    window.localStorage.setItem("init", true);
    this._pageHistory(histories, searchOptions);
  }

  static _pageHistory(histories, searchOptions) {
    if (histories.length > 0) {
      const lastHistoryItem = histories[histories.length - 1];
      Object.assign(searchOptions, {endTime: lastHistoryItem.lastVisitTime});
    } else {
      Object.assign(searchOptions, {endTime: searchOptions.endTime - 24 * 60 * 60 * 1000});
    }

    const startTime = searchOptions.startTime;
    const endTime = searchOptions.endTime;
    if (startTime > endTime) {
      // move too far back stop!
      console.log("stop paging!");
      return;
    }
    chrome.history.search(searchOptions, (results) => {
      if (startTime && endTime) {
        // api uses start and end time as OR instead of AND
        // so filter it for now or we could just use this ???
        results = results.filter((result) => result.lastVisitTime > startTime && result.lastVisitTime < endTime);
      }

      this.getBookmark()
        .then((bookmarks) => {
          const transformPromises = results.map((result) => this.transformHistory(result, bookmarks));
          Promise.all(transformPromises)
           .then((histories) => {
             histories.forEach((hist) => db.addOrUpdateExisting(HISTORY, hist));
             this._pageHistory(histories, searchOptions);
           });
        });
    });
  }

  /**
   * Filters out the blocked urls from a list of item
   *
   * @param {Array} items - List of items that needs to be filtered
   * @returns {Object} Promise that resolves with a list of urls that are not in the blocked list
   */
  static _filterBlockedUrls(items) {
    const promise = new Promise((resolve, reject) => {
      db.getAll(BLOCKED_URL)
        .then((blocked) => {
          const blockedUrls = blocked.map((block) => block.url);
          const nonBlockedUrls = items.filter((item) => blockedUrls.indexOf(item.url) === -1);
          resolve(nonBlockedUrls);
        });
    });

    return promise;
  }

  /**
   * Add blocked urls to db
   *
   * @param {string} blockedUrl - Url that is marked for block
   * @returns {Object} Promise that resolves when the db is done adding or updating
   */
  static addBlockedUrl(blockedUrl) {
    return db.addOrUpdateExisting(BLOCKED_URL, {url: blockedUrl});
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
   * Transform a raw history bookmark item into activity stream's history item,
   * merge the history item with the bookmark item that shares it's url if it hasn't and merge it's metadata
   *
   * @param {Object} hist - History item to be transformed
   * @param {Object} bookmarks - List of bookmarks
   * @returns {Object} Promise that resolves with the history item has been transformed
   */
  static transformHistory(hist, bookmarks) {
    const promise = new Promise((resolve, reject) => {
      db.getItem(METADATA, hist)
        .then((metadata) => {
          let mergedHist;
          if (!metadata) {
            mergedHist = this._mergeHistoryBookmark(hist, bookmarks);
            this._storeLinkMetadata(mergedHist);
          } else {
            mergedHist = Object.assign(hist, metadata);
          }
          Object.assign(mergedHist, {
            favicon_url: "chrome://favicon/" + hist.url,
            lastVisitDate: parseInt(hist.lastVisitTime, 10)
          });
          resolve(mergedHist);
        });
    });

    return promise;
  }

  /**
   * Transform a raw chrome bookmark item into activity stream's bookmark item and merge it's metadata
   *
   * @param {Object} bookmark - Bookmark to be transformed
   * @returns {Object} Promise that resolves with the bookmark has been transformed
   */
  static transformBookmark(bookmark) {
    const promise = new Promise((resolve, reject) => {
      db.getItem(METADATA, bookmark)
        .then((metadata) => {
          if (metadata) {
            Object.assign(bookmark, metadata);
          }
          Object.assign(bookmark, {
            favicon_url: "chrome://favicon/" + bookmark.url,
            bookmarkDateCreated: bookmark.dateAdded,
            bookmarkGuid: bookmark.id
          });
          resolve(bookmark);
        });
    });

    return promise;
  }

  /**
   * Recursively traverse the tree of bookmarks and store them in an array
   *
   * @param {Array} trees - Root of a Chrome bookmark tree item
   * @param {Array} bookmarks - List of bookmarks accumulated by traversing the tree
   */
  static _collectBookmarks(trees, bookmarks) {
    trees.forEach((tree) => {
      if (tree.children) {
        this._collectBookmarks(tree.children, bookmarks);
      }
      bookmarks.push(tree);
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

  /**
   * Store metadata associated with the link
   *
   * @param {Object} link - Link config
   * @param {string} link.bookmarkGuid - Link's bookmark id
   * @param {string} link.url - Link's url
   */
  static _storeLinkMetadata(link) {
    if (link.bookmarkGuid) {
      return;
    }
    const metadataObj = {
      url: link.url,
      bookmarkGuid: link.bookmarkGuid
    };
    db.addOrUpdateExisting(METADATA, metadataObj);
  }
};
