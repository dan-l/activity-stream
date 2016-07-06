const {BLOCKED_URL, METADATA, URL} = require("addon-chrome/constants");

const DB_VERSION = 1;
const DB_NAME = "activitystream";
const DB_MODE = "readwrite";
let _db = null;

module.exports = class Db {
	static init() {
		const promise = new Promise((resolve, reject) => {
			const request = indexedDB.open(DB_NAME, DB_VERSION);

			request.onerror = (event) => {
				throw new Error("IndexedDB not available?!");
			};

			request.onsuccess = (event) => {
				if (event.target.result.objectStoreNames.length > 0) {
					_db = event.target.result;
					resolve();
				}
			};

			request.onupgradeneeded = (event) =>  {
				_db = event.target.result;
				const version = _db.version;
				switch (version) {
					case 1:
						this._version1(resolve);
						break;
				}

			};
		});

		return promise;
	}

	static _currentSchema() {
		let schema = {};
		schema[1] = {};
		schema[1][BLOCKED_URL] = {
			keyPath: URL
		};
		schema[1][METADATA] = {
			keyPath: URL
		};
		return schema[DB_VERSION];
	}

	static _version1(resolve) {
		const keyStores = this._currentSchema();
		const stores = [];
		for(const store in keyStores) {
			const keyPath = keyStores[store].keyPath;
			stores.push(store);
			const objectStore = _db.createObjectStore(store, {keyPath});
			const index = keyStores[store].index;
			if (index !== undefined) {
				objectStore.createIndex(index, index, {unique: true});
			}
			objectStore.transaction.oncomplete = function(event) {
				resolve();
			};
		}
	}

	static addOrUpdateExisting(store, item) {
		const promise = new Promise((resolve, reject) => {
			const objectStore = this._getObjectStore(store);
			let getRequest = objectStore.get(item[objectStore.keyPath]);
			getRequest.onsuccess = function(event) {
				const oldValue = getRequest.result;

				if(!oldValue) {
					let addRequest = objectStore.add(item);

					addRequest.onsuccess = function(event) {
						resolve();
					};
				} else {
					Object.assign(oldValue, item);

					let putRequest = objectStore.put(oldValue);
					putRequest.onsuccess = function(event) {
						resolve();
					};
				}
			};
		});

		return promise;
	}

	static remove(store, key) {
		const promise = new Promise((resolve, reject) => {
			const objectStore = this._getObjectStore(store);
			const request = objectStore.delete(key);
			request.onsuccess = function(event) {
				resolve();
			};
		});

		return promise;
	}

	static removeAll(store) {
		const promise = new Promise((resolve, reject) => {
			const objectStore = this._getObjectStore(store);
			const request = objectStore.clear();
			request.onsuccess = function(event) {
				resolve();
			};
		});

		return promise;
	}

	static getItem(store, item) {
		const promise = new Promise((resolve, reject) => {
			const objectStore = this._getObjectStore(store);
			const request = objectStore.get(item[objectStore.keyPath]);
			request.onsuccess = function(event) {
				const value = request.result;
				resolve(value);
			};
		});

		return promise;
	}

	static getAll(store, opt) {
		const promise = new Promise((resolve, reject) => {
			const objectStore = this._getObjectStore(store);
			const results = [];
			let cursorReq;
			if (opt && opt.index) {
				cursorReq = objectStore.index(opt.index).openCursor(null, opt.direction);
			} else {
				cursorReq = objectStore.openCursor();
			}
			cursorReq.onsuccess = function(event) {
				const cursor = event.target.result;
				if (cursor) {
					results.push(cursor.value);
					cursor.continue();
				}
				else {
					resolve(results);
				}
			};
		});

		return promise;
	}

	static _getObjectStore(store) {
		const transaction = _db.transaction([store], DB_MODE);
		const objectStore = transaction.objectStore(store);
		return objectStore;
	}
};