const ChromeActivityStreams = require("addon-chrome/ChromeActivityStreams");
const {BLOCKED_URL, METADATA, URL} = require("addon-chrome/constants");
const Db = require("addon-chrome/db");

const React = require("react");
const ReactDOM = require("react-dom");
const {Provider} = require("react-redux");

const Routes = require("components/Routes/Routes");
const store = require("content-src/store");

// TODO linting, code analysis
// TODO docs

const keyStores = {};
keyStores[BLOCKED_URL] = {
	keyPath: URL
};
keyStores[METADATA] = {
	keyPath: URL
};

Db.init(keyStores).then(() => {
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

