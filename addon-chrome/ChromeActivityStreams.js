const {CONTENT_TO_ADDON, ADDON_TO_CONTENT} = require("common/event-constants");
const ChromePlacesProvider = require("addon-chrome/ChromePlacesProvider");

function dispatch(action) {
  window.dispatchEvent(
    new CustomEvent(ADDON_TO_CONTENT, {detail: action})
  );
}

module.exports = class ChromeActivityStreams {
	constructor() {
		this._setupListeners();
	}

	_setupListeners() {
		window.addEventListener(CONTENT_TO_ADDON, function(event) {
		  const action = JSON.parse(event.detail);
		  switch (action.type) {
        case "TOP_FRECENT_SITES_REQUEST":
          ChromePlacesProvider.getHistory().then((histories) => {
            const rows = histories.filter((data) => data.title !== 'New Tab')
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
          break;
        case "RECENT_BOOKMARKS_REQUEST":
          if (action.meta && action.meta.append) {
            dispatch({
              type: "RECENT_BOOKMARKS_RESPONSE",
              data: faker.createRows({beforeDate: action.data.beforeDate, type: "bookmark"}),
              meta: {append: true}
            });
          } else {
            ChromePlacesProvider.getBookmark().then((bookmarks) => dispatch({type: "RECENT_BOOKMARKS_RESPONSE", data: bookmarks}));
          }
          break;
        case "RECENT_LINKS_REQUEST":
          if (action.meta && action.meta.append) {
            dispatch({
              type: "RECENT_LINKS_RESPONSE",
              data: faker.createRows({beforeDate: action.data.beforeDate}),
              meta: {append: true}
            });
          } else {
            ChromePlacesProvider.getHistory().then((histories) => dispatch({type: "RECENT_LINKS_RESPONSE", data: histories}));
          }
          break;
        case "HIGHLIGHTS_LINKS_REQUEST":
          const bookmarkPromise = ChromePlacesProvider.getBookmark();
          const historyPromise = ChromePlacesProvider.getHistory();
          Promise.all([bookmarkPromise, historyPromise]).then((results) => {
            const rows = results.reduce((acc, result) => acc.concat(result), []);
            dispatch({type: "HIGHLIGHTS_LINKS_RESPONSE", data: rows});
          });
          break;
      }
    }, false);
	}

	unload() {
		window.removeEventListener(CONTENT_TO_ADDON);
	}	
}	

