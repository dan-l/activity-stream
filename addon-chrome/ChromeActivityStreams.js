const {CONTENT_TO_ADDON} = require("common/event-constants");
const ChromePlacesProvider = require("addon-chrome/ChromePlacesProvider");
const {dispatch} = require("addon-chrome/ChromeActionManager");

module.exports = class ChromeActivityStreams {
	constructor() {
		this._setupActionListeners();
    this._setupChromeListeners();
	}

  _setupActionListeners() {
    window.addEventListener(CONTENT_TO_ADDON, (event) => {
      const action = JSON.parse(event.detail);
      switch (action.type) {
        case "TOP_FRECENT_SITES_REQUEST":
          this._topFrecentSites(action);
          break;
        case "RECENT_BOOKMARKS_REQUEST":
          this._recentBookmarks(action);
          break;
        case "RECENT_LINKS_REQUEST":
          this._recentLinks(action);
          break;
        case "HIGHLIGHTS_LINKS_REQUEST":
          this._highlightsLinks(action);
          break;
      }
    }, false);
  }

  _setupChromeListeners() {
    chrome.history.onVisited.addListener((result) => {
      const row = {
        url: result.url, 
        title: result.title,
        favicon_url: "chrome://favicon/" + result.url,
        lastVisitDate: parseInt(result.lastVisitTime,10),
        count: result.visitCount + result.typedCount
      };
      dispatch({
        type: "RECENT_LINKS_RESPONSE", 
        data: [row],
        meta: {prepend: true}
      });
    });

    chrome.history.onVisitRemoved.addListener(() => {
      
    });

    chrome.bookmarks.onCreated.addListener(() => {

    });

    chrome.bookmarks.onRemoved.addListener(() => {

    });

    chrome.bookmarks.onChanged.addListener(() => {

    });
  }

  _topFrecentSites(action) {
    ChromePlacesProvider.getHistory().then((histories) => {
      const rows = histories.filter((result) => result.title !== 'New Tab')
        .sort((a,b) => {
        if (a.count > b.count) {
          return -1; // descending
        } 
        if(a.count < b.count) {
          return 1;
        } 
        return 0; // must be equal
      });
      dispatch({type: "TOP_FRECENT_SITES_RESPONSE", data:rows});
    })
  }

  _recentBookmarks(action) {
    if (action.meta && action.meta.append) {
      ChromePlacesProvider.getBookmark().then((bookmarks) => {
        dispatch({
          type: "RECENT_BOOKMARKS_RESPONSE",
          data: bookmarks.filter((bookmark) => bookmark.dateAdded < action.data.beforeDate),
          meta: {append: true}
        });
      });
    } else {
      ChromePlacesProvider.getBookmark().then((bookmarks) => {
        const rows = bookmarks.sort((a,b) => {
          if (a.dateAdded > b.dateAdded) {
            return -1; // descending
          } 
          if(a.dateAdded < b.dateAdded) {
            return 1;
          } 
          return 0; // must be equal
        });
    
        dispatch({type: "RECENT_BOOKMARKS_RESPONSE", data: rows})
      });
    }
  }

  _recentLinks(action) {
    if (action.meta && action.meta.append) {
      // Since 1 day might be too small a gap if we didn't browse 
      // but is 1 week the right choice?
      const aWeekAgo = action.data.beforeDate - (7*24*60*60*1000);
      ChromePlacesProvider.getHistory({startTime: aWeekAgo, endTime: action.data.beforeDate})
        .then((histories) => {
          dispatch({
            type: "RECENT_LINKS_RESPONSE", 
            data: histories,
            meta: {append: true}
          })
        });
    } else {
      ChromePlacesProvider.getHistory().then((histories) => {
        dispatch({type: "RECENT_LINKS_RESPONSE", data: histories})
      });
    }
  }

  _highlightsLinks(action) {
    const bookmarkPromise = ChromePlacesProvider.getBookmark();
    const historyPromise = ChromePlacesProvider.getHistory();
    Promise.all([bookmarkPromise, historyPromise]).then((results) => {
      const rows = results.reduce((acc, result) => acc.concat(result), []);
      dispatch({type: "HIGHLIGHTS_LINKS_RESPONSE", data: rows});
    });
  }

	unload() {
		window.removeEventListener(CONTENT_TO_ADDON);
	}	
}	

