module.exports =  class ChromePlacesProvider {

	static getBookmark() {
		const bookmarkPromise = new Promise((resolve, reject) => {
			chrome.bookmarks.getTree((trees) => {
				const rows = this._processBookmarks(trees)
					.filter((bookmark) => !!bookmark.url);
				resolve(rows);
			});
		});

		return bookmarkPromise;
	}

	static getHistory(options) {
		const defaultOption = {text: ""};
		const searchOptions = options ? Object.assign(options, defaultOption) : defaultOption;
		const startTime = searchOptions.startTime;
		const endTime = searchOptions.endTime;
		const historyPromise = new Promise((resolve, reject) => {
			chrome.history.search(searchOptions, (histories) => {
				if (startTime && endTime) {
					// for whatever reason the startTime and endTime parameter doesn't return the right results all the time,
					// so filter it for now or we could just use this ???
					histories = histories.filter((result) => result.lastVisitTime > startTime && result.lastVisitTime < endTime);
				}
				const rows = histories.map((result) => this.transformHistory(result));
				resolve(rows);
			});
		});

		const bookmarkPromise = this.getBookmark();

		const promise = new Promise((resolve, reject) => {
			Promise.all([historyPromise, bookmarkPromise]).then((results) => {
				resolve(this._mergeLinks(results[0], results[1]));
			});
		});

		return promise;
	}

	static _mergeLinks(r1, r2) {
    // merge similiar entries from r2 into r1
    const links = [];
    const urls = r1.map((r) => r.url);
    const urls2 = r2.map((r) => r.url);
    urls.forEach((u, i) => {
      const i2 = urls2.indexOf(u);
      const link = r1[i];
      if (i2 > -1) {
        const link2 = r2[i2];
        links.push(Object.assign(link, link2));
      } else {
        links.push(link);
      }
    });
    return links;
  }

	static transformHistory(hist) {
		return Object.assign({
			url: hist.url,
			title: hist.title,
			favicon_url: "chrome://favicon/" + hist.url,
			lastVisitDate: parseInt(hist.lastVisitTime, 10),
			count: hist.visitCount + hist.typedCount
		}, hist);
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