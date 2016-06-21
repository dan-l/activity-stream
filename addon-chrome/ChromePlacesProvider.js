function _processBookmarks(trees) {
  const bookmarks = [];
  _collectBookmarks(trees, bookmarks);
  return bookmarks;
}

// keep all properties except for children 
function _transformBookmark(bookmark) {
  const newBookmark = {};
  for(const key in bookmark) {
    if (bookmark.hasOwnProperty(key) && key !== 'children') {
      newBookmark[key] = bookmark[key];
    }
  }
  return newBookmark;
}

// recursively traverse the tree of bookmarks and store them in an array
function _collectBookmarks(trees, bookmarks) {
  trees.forEach((tree) => {
    if (tree.children) {
      _collectBookmarks(tree.children, bookmarks);
    }
    bookmarks.push(_transformBookmark(tree));
  });
}

module.exports =  class ChromePlacesProvider {
	static init() {
		// setup history and bookmarks listeners	
	}

	static getBookmark() {
		const bookmarkPromise = new Promise((resolve, reject) => {
		  chrome.bookmarks.getTree((trees) => {
		    const rows = _processBookmarks(trees).filter((bookmark) => !!bookmark.url);
		    resolve(rows);
		  });
		});

		return bookmarkPromise;
	}

	static getHistory() {
		const historyPromise = new Promise((resolve, reject) => {
		  chrome.history.search({text: ''}, (histories) => {
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
}