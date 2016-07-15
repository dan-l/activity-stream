const db = require("addon-chrome/db");
const {METADATA} = require("addon-chrome/constants");
const {getMetadata} = require("page-metadata-parser");

module.exports = class ChromePreviewProvider {
   /**
   * Fetches images and description for a list of sites
   *
   * @param {Array} sites - List of sites to get highlight images for
   * @returns {Object} Promise that resolves with list of sites and their highlight images
   */
  static getLinksMetadata(sites) {
    const highlightImgPromise = new Promise((resolve, reject) => {
      sites.length = 20;
      const metadataHighlights = sites.map((site) => {
        if (site.images) {
          return site;
        }

        return this._getMetadata(site);
      });

      Promise.all(metadataHighlights).then((highlights) => {
        highlights.forEach((highlight) => {
          if (!highlight) {
            return;
          }
          const metadata = {
            url: highlight.url,
            images: highlight.images,
            description: highlight.description
          };
          db.addOrUpdateExisting(METADATA, metadata);
        });
        highlights = highlights.filter((highlight) => highlight && !!highlight.images && !!highlight.description);
        resolve(highlights);
      });
    });

    return highlightImgPromise;
  }

  /**
   * Get metadata about a site
   */
  static _getMetadata(site) {
    return new Promise((resolve, reject) => {
      db.getItem(METADATA, {url: site.url})
        .then((metadata) => {
          if (metadata && metadata.images !== undefined) {
            console.log("hit preview cache");
            Object.assign(site, metadata);
            resolve(site);
          } else {
            rateLimit(() => this._fetchMetadata(site))
              .then(resolve);
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

    const promise = new Promise((resolve, reject) => {
      fetch(site.url)
        .then((response) => response.text())
        .catch((ex) => resolve(site)) // can"t preview sites like localhost
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

    return promise;
  }
};

/**
 * Rate limit to fire once every 100ms by default
 * http://jsfiddle.net/dandv/47cbj/
 */
function rateLimit(fn, delay = 100, context) {
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

  return new Promise((resolve, reject) => {
    queue.push({
      context: context || this,
      arguments: [].slice.call(arguments)
    });
    if (!timer) {
      processQueue(resolve);  // start immediately on the first invocation
      timer = setInterval(processQueue, delay);
    }
  });
}
