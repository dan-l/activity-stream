const db = require("addon-chrome/db");
const {METADATA} = require("addon-chrome/constants");
const {getMetadata} = require("page-metadata-parser");

module.exports = class ChromePreviewProvider {
   /**
   * Fetches metadata for a list of sites
   *
   * @param {Array} sites - List of sites to get metadata for
   * @returns {Object} Promise that resolves with list of sites with their metadata
   */
  static getLinksMetadata(sites) {
    return new Promise((resolve) => {
      const metadataPromise = sites
        .filter((site) => !/(google|localhost|chrome)/.test(site.url))
        .slice(0, 8)
        .map((site) => this._getMetadata(site));

      Promise.all(metadataPromise).then((sitesWithMetadata) => {
        sitesWithMetadata = sitesWithMetadata.filter((siteWithMetadata) =>
          !!siteWithMetadata && !!siteWithMetadata.images && !!siteWithMetadata.description);
        resolve(sitesWithMetadata);
      });
    });
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
    return new Promise((resolve) => {
      const url = site.url;
      db.getItem(METADATA, {url}).then((metadata) => {
        if (metadata) {
          Object.assign(site, metadata);
          resolve(site);
        } else {
          this._rateLimit(() => this._fetchMetadata(site))
            .then((siteWithMetadata) => {
              const metadata = {
                url: siteWithMetadata.url,
                images: siteWithMetadata.images,
                description: siteWithMetadata.description
              };
              db.addOrUpdateExisting(METADATA, metadata);
              resolve(siteWithMetadata);
            });
        }
      });
    });
  }

  /**
   * Fetch metadata about a site
   * @param {Object} site
   *
   * @returns {Object} site with metadata
   **/
  static _fetchMetadata(site)  {
    const imageWidth = 450;
    const imageHeight = 278;

    return new Promise((resolve) => {
      fetch(site.url)
        .then((response) => response.text())
        .catch((ex) => resolve(site))
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

          resolve(site);
        });
    });
  }

  /**
   * Rate limit to fire once every 100ms by default
   * http://jsfiddle.net/dandv/47cbj/
   *
   * @param {Function} fn - Function to rate limit
   * @param {Number} delay - Limits fn to execute once every delay
   * @param {Object} context - Context of 'this'
   */
   static _rateLimit(fn, delay = 100, context = this) {
    let queue = [];
    let timer = null;

    function processQueue(resolve) {
      let item = queue.shift();
      if (item) {
        fn.apply(item.context, item.arguments).then(resolve);
      }
      if (queue.length === 0) {
        clearInterval(timer), timer = null;
      }
    }

    return new Promise((resolve) => {
      queue.push({
        context,
        arguments: [].slice.call(arguments)
      });
      if (!timer) {
        processQueue(resolve);
        timer = setInterval(processQueue, delay);
      }
    });
  }
};
