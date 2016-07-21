const {BLOCKED_URL, METADATA, URL} = require("addon-chrome/constants");

const DB_VERSION = 1;
const DB_NAME = "activitystream";
const DB_MODE = "readwrite";
let _db = null;

module.exports = class Db {
  /**
   * Open the database and run migration if DB_VERSION has changed
   *
   * @returns {Object} Promise that resolves either when
   *                   the db has been successfully created or
   *                   the db has been successfully migrated
   */
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

  /**
   * Defines DB_VERSION specific schema
   *
   * @returns {Object} Schema for the current DB_VERSION
   */
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

  /**
   * Migration for DB_VERSION 1
   * Creates stores and index for schema version 1
   *
   * @param {function} resolve - Callback function called when done
   */
  static _version1(resolve) {
    const keyStores = this._currentSchema();
    const stores = [];
    const done = function(event) {
      if (stores.length === keyStores.length) {
        resolve();
      }
    };
    for (const store in keyStores) {
      const keyPath = keyStores[store].keyPath;
      stores.push(store);
      const objectStore = _db.createObjectStore(store, {keyPath});
      const index = keyStores[store].index;
      if (index !== undefined) {
        objectStore.createIndex(index, index, {unique: true});
      }
      objectStore.transaction.oncomplete = done;
    }
  }

  /**
   * Add a new item to the store if it doesn't exist,
   * otherwise update the existing item by merging the old with new
   *
   * @param {string} store - Name of the store
   * @param {object} item - Item to be added or updated
   * @returns {Object} Promise that resolves when the item has been added or updated successfully
   */
  static addOrUpdateExisting(store, item) {
    const promise = new Promise((resolve, reject) => {
      const objectStore = this._getObjectStore(store);
      let getRequest = objectStore.get(item[objectStore.keyPath]);
      getRequest.onsuccess = function(event) {
        const oldValue = getRequest.result;

        if (!oldValue) {
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

  /**
   * Remove an item from the store with the specified key
   *
   * @param {string} store - Name of the store
   * @param {string} key - Key that idenfities the item to be removed
   * @returns {Object} Promise that resolves when the item has been deleted successfully
   */
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

  /**
   * Remove every item from the store
   *
   * @param {string} store - Name of the store
   * @returns {Object} Promise that resolves when the store has been cleared successfully
   */
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

  /**
   * Get an item from the store
   *
   * @param {string} store - Name of the store
   * @param {object} item - Item to get from the store
   * @returns {Object} Promise that resolves with the found item
   */
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

  /**
   * Get every item from the store
   *
   * @param {string} store - Name of the store
   * @param {object} opt - Optional options for getting items from a store
   * @param {string} opt.index - Index to query the store with
   * @param {string} opt.direction - Direction to query the store with
   * @returns {Object} Promise that resolves with an array of found items
   */
  static getAll(store, opt) {
    const promise = new Promise((resolve, reject) => {
      const objectStore = this._getObjectStore(store);
      const results = [];
      let cursorReq;
      const ascending = "NEXT";
      if (opt && opt.index) {
        const direction = opt.direction || ascending;
        cursorReq = objectStore.index(opt.index).openCursor(null, direction);
      } else {
        cursorReq = objectStore.openCursor();
      }
      cursorReq.onsuccess = function(event) {
        const cursor = event.target.result;
        if (cursor) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          resolve(results);
        }
      };
    });

    return promise;
  }

  /**
   * Get a object store
   *
   * @param {string} store - Name of the store
   * @returns {object} Store with the name specified
   */
  static _getObjectStore(store) {
    const transaction = _db.transaction([store], DB_MODE);
    const objectStore = transaction.objectStore(store);
    return objectStore;
  }
};
