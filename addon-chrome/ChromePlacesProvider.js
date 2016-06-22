module.exports =  class ChromePlacesProvider {
	static getBookmark() {
		const bookmarkPromise = new Promise((resolve, reject) => {
		  chrome.bookmarks.getTree((trees) => {
		    const rows = this._processBookmarks(trees).filter((bookmark) => !!bookmark.url);
		    resolve(rows);
		  });
		});

		return bookmarkPromise;
	}

	static getHistory(options) {
		const defaultOption = {text: ''};
		const searchOptions = options? Object.assign(options, defaultOption) : defaultOption;
		const startTime = searchOptions.startTime;
		const endTime = searchOptions.endTime;
		const historyPromise = new Promise((resolve, reject) => {
		  chrome.history.search(searchOptions, (histories) => {
		  	if (startTime && endTime) {
		  		// for whatever reason the startTime and endTime parameter doesn't return the right results all the time, 
		  		// so filter it for now or we could just use this ??? 
		  		histories = histories.filter((data) => data.lastVisitTime > startTime && data.lastVisitTime < endTime);
		  	}
		    const rows = histories.map((data) => {
		      return {
		        url: data.url, 
		        title: data.title,
		        favicon_url: "chrome://favicon/" + data.url,
		        lastVisitDate: parseInt(data.lastVisitTime,10),
		        count: data.visitCount + data.typedCount
		      };
		    });
	      resolve(rows);
	    });
		});

		return historyPromise;
	}

	static _processBookmarks(trees) {
	  const bookmarks = [];
	  this._collectBookmarks(trees, bookmarks);
	  return bookmarks;
	}

	// keep all properties except for children 
	static _transformBookmark(bookmark) {
	  const newBookmark = {};
	  for(const key in bookmark) {
	    if (bookmark.hasOwnProperty(key) && key !== 'children') {
	      newBookmark[key] = bookmark[key];
	    }
	  }
	  newBookmark.bookmarkDateCreated = bookmark.dateAdded;
	  return newBookmark;
	}

	// recursively traverse the tree of bookmarks and store them in an array
	static _collectBookmarks(trees, bookmarks) {
	  trees.forEach((tree) => {
	    if (tree.children) {
	      this._collectBookmarks(tree.children, bookmarks);
	    }
	    bookmarks.push(this._transformBookmark(tree));
	  });
	}
}