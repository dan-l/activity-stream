const db = require("addon-chrome/db");
const {BOOKMARK, HISTORY, BLOCKED_URL, LAST_VISIT_TIME, DATE_ADDED, PREV} = require("addon-chrome/constants");
const {getMetadata} = require("page-metadata-parser");

module.exports =  class ChromePlacesProvider {

	static init() {
		const historyPromise = this._getHistory();
		const bookmarkPromise = this._getBookmark();

		const promise = new Promise((resolve, reject) => {
			Promise.all([historyPromise, bookmarkPromise]).then((results) => {
				const histories = results[0];
				const bookmarks = results[1];

				bookmarks.forEach((r) => db.addToDb(BOOKMARK, r));
				if (histories) {
					this._setLastRequestTime(histories[0].lastVisitDate);
					this._mergeLinks(histories, bookmarks)
						.forEach((r) => db.addToDb(HISTORY, r));
				}

				resolve();
			});
		});

		return promise;
	}

	static addBookmark(newBookmark) {
		const bookmarkPromise = db.addToDb(BOOKMARK, newBookmark);
		const historyPromise = db.addToDb(HISTORY, {url: newBookmark.url, bookmarkGuid: newBookmark.bookmarkGuid});
		return Promise.all([bookmarkPromise, historyPromise]).then((results) => {
			return results[0];
		});
	}

	static removeBookmark(removeGuid) {
		return db.removeFromDb(BOOKMARK, removeGuid);
	}

	static addHistory(newHistory) {
		return db.getFromDb(BOOKMARK, {index: DATE_ADDED, direction: PREV})
			.then((bookmarks) => {
				const hist = this._mergeLinks([newHistory], bookmarks)[0];
				return db.addToDb(HISTORY, hist);
			});
	}

	static removeHistory(removeUrl) {
		return db.removeFromDb(HISTORY, removeUrl);
	}

	static addBlockedUrl(blockedUrl) {
		return db.addToDb(BLOCKED_URL, {url: blockedUrl});
	}

	static unblockAllUrl() {
		return db.removeAllFromDb(BLOCKED_URL);
	}

	static getBookmark() {
		const bookmarkPromise = new Promise((resolve, reject) => {
			const dbPromise = db.getFromDb(BOOKMARK, {index: DATE_ADDED, direction: PREV});
			const blockedUrlPromise = db.getFromDb(BLOCKED_URL);
			Promise.all([dbPromise, blockedUrlPromise])
				.then((results) => {
					const bookmarks = this._filterBlockedUrls(results[0], results[1]);
					resolve(bookmarks);
				});
		});

		return bookmarkPromise;
	}

	static getHistory(options) {
		const historyPromise = new Promise((resolve, reject) => {
			if (options) {
				this._getHistory(options).then((newHistories) => {
					db.getFromDb(BOOKMARK, {index: DATE_ADDED, direction: PREV})
						.then((bookmarks) => {
							const mergedLinks = this._mergeLinks(newHistories, bookmarks);
							mergedLinks.forEach((link) => db.addToDb(HISTORY, link));
							db.getFromDb(BLOCKED_URL).then((blockedUrls) => {
								const histories = this._filterBlockedUrls(mergedLinks, blockedUrls);
								resolve(histories);
							});
						});
				});
			} else {
				const dbPromise = db.getFromDb(HISTORY, {index: LAST_VISIT_TIME, direction: PREV});
				const blockedUrlPromise = db.getFromDb(BLOCKED_URL);
				Promise.all([dbPromise, blockedUrlPromise])
					.then((results) => {
						const histories = this._filterBlockedUrls(results[0], results[1]);
						resolve(histories);
					});
			}
		});
		return historyPromise;
	}

	static _getBookmark() {
		const bookmarkPromise = new Promise((resolve, reject) => {
			chrome.bookmarks.getTree((trees) => {
				const rows = this._processBookmarks(trees)
					.filter((bookmark) => !!bookmark.url);
				resolve(rows);
			});
		});

		return bookmarkPromise;
	}

	static _getHistory(options) {
		const defaultOption = {
			text: "",
			startTime: this._getLastRequestTime() || new Date().getTime() - (7 * 24 * 60 * 60 * 1000)
		};
		const searchOptions = options ? Object.assign(defaultOption, options) : defaultOption;
		const startTime = searchOptions.startTime;
		const endTime = searchOptions.endTime;
		const historyPromise = new Promise((resolve, reject) => {
			chrome.history.search(searchOptions, (histories) => {
				if (startTime && endTime) {
					// for whatever reason the startTime and endTime parameter doesn't return the right results all the time,
					// so filter it for now or we could just use this ???
					histories = histories.filter((result) => result.lastVisitDate > startTime && result.lastVisitDate < endTime);
				}
				Promise.all(histories.map((result) => this.transformHistory(result)))
					.then((rows) => resolve(rows));
			});
		});

		return historyPromise;
	}

	static _setLastRequestTime(time) {
		window.localStorage.setItem("lastrequestdate", time);
	}

	static _getLastRequestTime() {
		return parseInt(window.localStorage.getItem("lastrequestdate"), 10);
	}

	static _filterBlockedUrls(items, blockedUrls) {
		return items.filter((item) =>
			blockedUrls.map((blocked) => blocked.url).indexOf(item.url) === -1);
	}

	static _mergeLinks(r1, r2) {
		if(r1.length === 0) return r1;
    // merge similiar entries from r2 into r1
    const links = [];
    const urls = r1.map((r) => r.url);
    const urls2 = r2.map((r) => r.url);
    urls.forEach((u, i) => {
      const i2 = urls2.indexOf(u);
      const link = r1[i];
      if (i2 > -1) {
        const link2 = r2[i2];
        link.bookmarkGuid = link2.bookmarkGuid;
      }
      links.push(link);
    });
    return links;
  }

	static transformHistory(hist) {
		return fetch(hist.url)
			.then((r) => r.text())
			.then((r) => {
				const pageMetadata = getMetadata(new DOMParser().parseFromString(r, "text/html"));
				const imageWidth = 450;
				const imageHeight = 278;
				const imageUrl = pageMetadata.image_url;

				if (imageUrl) {
					Object.assign(hist, {
						images: [{
							url: imageUrl,
							width: imageWidth,
							height: imageHeight
						}]
					});
				}

				return Object.assign(hist, {
					description: pageMetadata.description,
					favicon_url: pageMetadata.icon_url || "chrome://favicon/" + hist.url,
					lastVisitDate: parseInt(hist.lastVisitTime, 10)
				});
			});
	}

	static _processBookmarks(trees) {
		const bookmarks = [];
		this._collectBookmarks(trees, bookmarks);
		return bookmarks;
	}

	// keep all properties except for children
	static transformBookmark(bookmark) {
		const newBookmark = {};
		for(const key in bookmark) {
			if (bookmark.hasOwnProperty(key) && key !== "children") {
				newBookmark[key] = bookmark[key];
			}
		}
		newBookmark.bookmarkDateCreated = bookmark.dateAdded;
		newBookmark.bookmarkGuid = bookmark.id;
		return newBookmark;
	}

	// recursively traverse the tree of bookmarks and store them in an array
	static _collectBookmarks(trees, bookmarks) {
		trees.forEach((tree) => {
			if (tree.children) {
				this._collectBookmarks(tree.children, bookmarks);
			}
			bookmarks.push(this.transformBookmark(tree));
		});
	}
};