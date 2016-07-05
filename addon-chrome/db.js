const DB_NAME = "activitystream";
const DB_MODE = "readwrite";
let _db = null;

module.exports = class Db {
	static init(keyStores) {
		const promise = new Promise((resolve, reject) => {
			const request = indexedDB.open(DB_NAME, 1);

			request.onerror = function(event) {
				throw new Error("IndexedDB not available?!");
			};

			request.onsuccess = function(event) {
				if (event.target.result.objectStoreNames.length > 0) {
					_db = event.target.result;
					resolve();
				}
			};

			request.onupgradeneeded = function(event) {
				_db = event.target.result;
				const stores = [];
				for(const store in keyStores) {
					const keyPath = keyStores[store].keyPath;
					stores.push(store);
					const objectStore = _db.createObjectStore(store, {keyPath});
					const index = keyStores[store].index;
					if (index) {
						objectStore.createIndex(index, index, {unique: true});
					}
					objectStore.transaction.oncomplete = function(event) {
						resolve();
					};
				}
			};
		});

		return promise;
	}

	static addToDb(store, item) {
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

	static removeFromDb(store, key) {
		const promise = new Promise((resolve, reject) => {
			const objectStore = this._getObjectStore(store);
			const request = objectStore.delete(key);
			request.onsuccess = function(event) {
				resolve();
			};
		});

		return promise;
	}

	static removeAllFromDb(store) {
		const promise = new Promise((resolve, reject) => {
			const objectStore = this._getObjectStore(store);
			const request = objectStore.clear();
			request.onsuccess = function(event) {
				resolve();
			};
		});

		return promise;
	}

	static getFromDb(store, item) {
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

	static getAllFromDb(store, opt) {
		const promise = new Promise((resolve, reject) => {
			const objectStore = this._getObjectStore(store);
			const results = [];
			const cursorReq = opt && opt.index ? objectStore.index(opt.index).openCursor(null, opt.direction) : objectStore.openCursor();
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