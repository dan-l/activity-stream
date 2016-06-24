const ChromePlacesProvider = require("addon-chrome/ChromePlacesProvider");
const ChromeActivityStreams = require("addon-chrome/ChromeActivityStreams");
const {BOOKMARK, HISTORY, BLOCKED_URL, BOOKMARK_GUID, URL, LAST_VISIT_TIME, DATE_ADDED} = require("addon-chrome/constants");
const Db = require("addon-chrome/db");

const React = require("react");
const ReactDOM = require("react-dom");
const {Provider} = require("react-redux");

const Routes = require("components/Routes/Routes");
const store = require("content-src/store");

const keyStores = {};
keyStores[BOOKMARK] = {
	keyPath: BOOKMARK_GUID,
	index: DATE_ADDED
};
keyStores[HISTORY] = {
	keyPath: URL,
	index: LAST_VISIT_TIME
};
keyStores[BLOCKED_URL] = {
	keyPath: URL
};

Db.init(keyStores).then(() => {
	ChromePlacesProvider.init().then(() => {
		new ChromeActivityStreams();
		const Root = React.createClass({
			render() {
				return (<Provider store={store}>
					<Routes />
				</Provider>);
			}
		});

		ReactDOM.render(<Root />, document.getElementById("root"));
	});
});

