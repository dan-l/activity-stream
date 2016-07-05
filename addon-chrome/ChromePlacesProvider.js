const db = require("addon-chrome/db");

const {BLOCKED_URL, METADATA} = require("addon-chrome/constants");
const {getMetadata} = require("page-metadata-parser");

module.exports = class ChromePlacesProvider {
	static topFrecentSites() {
		const promise = new Promise((resolve, reject) => {
			this.getHistory().then((histories) => {
			  // https://dxr.mozilla.org/mozilla-central/source/mobile/android/base/java/org/mozilla/gecko/db/BrowserContract.java#124
			  // numVisits * max(1, 100 * 225 / (age*age + 225))
			  const rows = histories
			    .filter((hist) => !/google/.test(hist.url))
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
					if(a.dateAdded < b.dateAdded) {
						return 1;
					}
					return 0;
				});
				resolve(rows);
	    })
		});

		return promise;
	}

	static recentLinks(options) {
		const promise = new Promise((resolve, reject) => {
			let searchOptions;
			if (options && options.beforeDate) {
		    // Since 1 day might be too small a gap if we didn't browse
		    // but is 1 week the right choice?
			  const aWeekAgo = options.beforeDate - (7 * 24 * 60 * 60 * 1000);
				searchOptions = {
					startTime: aWeekAgo,
					endTime: options.beforeDate
				};
			}
	    this.getHistory(searchOptions).then(resolve);
		});

		return promise;
	}

	static highlightsLinks() {
		const hightlightsPromise = new Promise((resolve, reject) => {
			const bookmarkPromise = this.getBookmark();
			const historyPromise = this.getHistory();
			const threeDays = 3 * 24 * 60 * 60 * 1000;
			const today = new Date().getTime();

			Promise.all([bookmarkPromise, historyPromise]).then((results) => {
				const bookmarks = results[0];
				const histories = results[1];

				const rows = bookmarks.concat(histories)
					.filter((r, index) => {
						const isThreeDaysOrOlder = (today - (r.lastVisitDate || r.dateAdded)) > threeDays;
						const isVisitCountAtMostThree = (r.visitCount || 0) <= 3;
						return !/google/.test(r.url) && isThreeDaysOrOlder && isVisitCountAtMostThree;
					});

				resolve(rows);
			});
		});

		return hightlightsPromise;
	}

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

	static getHistory(options) {
		const aWeekAgo = new Date().getTime() - (7 * 24 * 60 * 60 * 1000);
		const defaultOption = {
			text: "",
			startTime: aWeekAgo
		};
		const searchOptions = options ? Object.assign(defaultOption, options) : defaultOption;
		const startTime = searchOptions.startTime;
		const endTime = searchOptions.endTime;
		const promise = new Promise((resolve, reject) => {
			chrome.history.search(searchOptions, (results) => {
				if (startTime && endTime) {
					// api uses start and end time as OR instead of AND
					// so filter it for now or we could just use this ???
					results = results.filter((result) => result.lastVisitTime > startTime && result.lastVisitTime < endTime);
				}
				this.getBookmark().
					then((bookmarks) => {
						const transformPromises = results.map((result) => this.transformHistory(result, bookmarks));
						Promise.all(transformPromises).
							then((histories) => this._filterBlockedUrls(histories).then(resolve));
					});
			});
		});

		return promise;
	}

	static _filterBlockedUrls(items) {
		const promise = new Promise((resolve, reject) => {
			db.getAllFromDb(BLOCKED_URL)
				.then((blockedUrls) => {
					const nonBlockedUrls = items.filter((item) => blockedUrls.indexOf(item.url) === -1);
					resolve(nonBlockedUrls);
				});
		});

		return promise;
	}

	static addBlockedUrl(blockedUrl) {
		return db.addToDb(BLOCKED_URL, {url: blockedUrl});
	}

	static unblockAllUrl() {
		return db.removeAllFromDb(BLOCKED_URL);
	}

	static getHighlightsImg(sites) {
		const imageWidth = 450;
		const imageHeight = 278;

		const highlightImgPromise = new Promise((resolve, reject) => {
			const imgPromises = sites.map((site) => {
				if (site.images) return site;

				return fetch(site.url)
					.then((r) => r.text())
					.catch((ex) => imgPromises.push(site)) // can't preview sites like localhost
					.then((r) => {
						const pageMetadata = getMetadata(new DOMParser().parseFromString(r, "text/html"));

						const imageUrl = pageMetadata.image_url;
						const description = pageMetadata.description;
						const images = [];

						if (imageUrl) {
							images.push({
								url: imageUrl,
								width: imageWidth,
								height: imageHeight
							});
						}

						return Object.assign(site, {images, description});
					});
			});

			Promise.all(imgPromises).then((highlights) => {
				highlights.forEach((highlight) => {
					if (!highlight) return;
					const metadata = {
						url: highlight.url,
						images: highlight.images,
						description: highlight.description
					};
					db.addToDb(METADATA, metadata);
				});
				resolve(highlights);
			});
		});

		return highlightImgPromise;
	}

	static transformHistory(hist, bookmarks) {
		const promise = new Promise((resolve, reject) => {
			db.getFromDb(METADATA, hist)
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

	static transformBookmark(bookmark) {
		const promise = new Promise((resolve, reject) => {
			db.getFromDb(METADATA, bookmark)
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

	// recursively traverse the tree of bookmarks and store them in an array
	static _collectBookmarks(trees, bookmarks) {
		trees.forEach((tree) => {
			if (tree.children) {
				this._collectBookmarks(tree.children, bookmarks);
			}
			bookmarks.push(tree);
		});
	}

	static _mergeHistoryBookmark(hist, bookmarks) {
		const bookmarkUrls = bookmarks.map((bookmark) => bookmark.url);
		const index = bookmarkUrls.indexOf(hist.url);
		if (index > -1) {
			Object.assign(hist, {bookmarkGuid: bookmarks[index].bookmarkGuid});
		}
		return hist;
	}

	static _storeLinkMetadata(link) {
		if (link.bookmarkGuid) return;
		const metadataObj = {
			url: link.url,
			bookmarkGuid: link.bookmarkGuid
		};
		db.addToDb(METADATA, metadataObj);
	}
};