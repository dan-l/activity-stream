const ChromeActivityStreams = require("addon-chrome/ChromeActivityStreams");
const Db = require("addon-chrome/db");

const React = require("react");
const ReactDOM = require("react-dom");
const {Provider} = require("react-redux");

const Routes = require("components/Routes/Routes");
const store = require("content-src/store");

// TODO linting, code analysis
// TODO docs

Db.init().then(() => {
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

