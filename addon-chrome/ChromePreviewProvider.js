const db = require("addon-chrome/db");
const {METADATA} = require("addon-chrome/constants");
const {getMetadata} = require("page-metadata-parser");
const _ = require("lodash/function");

module.exports = class ChromePreviewProvider {
   /**
   * Fetches metadata for a list of sites that will be potential highlight items
   *
   * @param {Array} sites - List of sites to get metadata for
   * @returns {Object} Promise that resolves with list of sites with their metadata
   */
  static getLinksMetadataForHighlights(sites) {
    return new Promise((resolve) => {
      // Reduce the number of expensive network request we need to make
      // as we only need to display 3 items, a little double that amount should suffice to have a pool to select from
      const limit = 8;

      const metadataPromise = sites
        .slice(0, limit)
        .map((site) => this._getMetadata(site));

      Promise.all(metadataPromise).then((sitesWithMetadata) => {
        sitesWithMetadata = sitesWithMetadata.filter((siteWithMetadata) =>
          !!siteWithMetadata && !!siteWithMetadata.images && !!siteWithMetadata.description);
        resolve(sitesWithMetadata);
      });
    });
  }

  /**
   * Remove item from metadata cache
   *
   * @param {string} url - Item's url
   */
  static removeMetadata(url) {
    db.remove(METADATA, url);
  }

  /**
  * Fetches metadata for a site and cache it
  *
  * @param {Object} site - Site to get metadata for
  */
  static cacheMetadata(site) {
    this._getMetadata(site);
  }

  /**
   * Get metadata about a site and cache them if they don't exist in the cache already
   * Otherwise get it from the cache
   *
   * @param {Object} site - Site to get metadata for
   */
  static _getMetadata(site) {
    const waitTime = 250;

    return new Promise((resolve) => {
      const url = site.url;
      const done = function(siteWithMetadata) {
        const metadata = {
          url: siteWithMetadata.url,
          images: siteWithMetadata.images,
          description: siteWithMetadata.description
        };
        db.addOrUpdateExisting(METADATA, metadata);
        resolve(siteWithMetadata);
      };

      db.getItem(METADATA, {url}).then((metadata) => {
        if (metadata) {
          Object.assign(site, metadata);
          resolve(site);
        } else {
          _.throttle(() => this._fetchMetadata(site, done), waitTime, {})();
        }
      });
    });
  }

  /**
   * Fetch metadata about a site
   *
   * @param {Object} site - Site to fetch metadata for
   * @param {Function} callback - Callback function
   */
  static _fetchMetadata(site, callback)  {
    const imageWidth = 450;
    const imageHeight = 278;

    fetch(site.url)
      .then((response) => response.text())
      .catch((ex) => callback(site))
      .then((domString) => {
        const pageMetadata = getMetadata(new DOMParser().parseFromString(domString, "text/html"));

        const imageUrl = pageMetadata.image_url;
        const description = pageMetadata.description;
        const iconUrl = pageMetadata.icon_url;
        const images = [];

        if (imageUrl) {
          images.push({
            url: imageUrl,
            width: imageWidth,
            height: imageHeight
          });
          Object.assign(site, {images});
        }

        if (description) {
          Object.assign(site, {description});
        }

        if (iconUrl) {
          Object.assign(site, {favicon_url: iconUrl});
        }

        callback(site);
      });
  }
};
