const fakeData = require("lib/fake-data");
const faker = require("test/faker");
const {ADDON_TO_CONTENT, CONTENT_TO_ADDON} = require("common/event-constants");

function dispatch(action) {
  window.dispatchEvent(
    new CustomEvent(ADDON_TO_CONTENT, {detail: action})
  );
}

module.exports = function() {
  window.addEventListener(CONTENT_TO_ADDON, function(event) {
    const action = JSON.parse(event.detail);
    switch (action.type) {
      case "TOP_FRECENT_SITES_REQUEST":
        chrome.history.search({text: ''}, function(histories) {
          const rows = histories.map(function(data) {
            return {
              url: data.url,
              title: data.title, 
              favicon_url: "chrome://favicon/" + data.url,
              lastVisitDate: parseInt(data.lastVisitTime,10),
              count: data.visitCount + data.typedCount
            };
          }).filter(function(data) {
            return data.title !== "New Tab";
          }).sort(function(a, b) { 
            // descending
            if (a.count > b.count) {
                return -1;
              }
              if (a.count < b.count) {
                return 1;
              }
              // a must be equal to b
              return 0;
          });
          dispatch({type: "TOP_FRECENT_SITES_RESPONSE", data: rows});
        });
        break;
      case "RECENT_BOOKMARKS_REQUEST":
        if (action.meta && action.meta.append) {
          dispatch({
            type: "RECENT_BOOKMARKS_RESPONSE",
            data: faker.createRows({beforeDate: action.data.beforeDate, type: "bookmark"}),
            meta: {append: true}
          });
        } else {
          dispatch({type: "RECENT_BOOKMARKS_RESPONSE", data: fakeData.Bookmarks.rows});
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
          chrome.history.search({text: ''}, function(histories) {
            const rows = histories.map(function(data) {
              return {
                url: data.url,
                title: data.title, 
                favicon_url: "chrome://favicon/" + data.url,
                lastVisitDate: parseInt(data.lastVisitTime,10)
              };
            });
            dispatch({type: "RECENT_LINKS_RESPONSE", data: rows});
          });
        }
        break;
      case "HIGHLIGHTS_LINKS_REQUEST":
        dispatch({type: "HIGHLIGHTS_LINKS_RESPONSE", data: fakeData.Highlights.rows});
        break;
    }
  }, false);
};
