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
      const metadataHighlights = sites.map((site) => {
        if (site.images) {
          return site;
        }

        return rateLimit(() => this._getMetadata(site));
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
        resolve(highlights);
      });
    });

    return highlightImgPromise;
  }

  /**
   * Fetch metadata about a site
   * @param {Object} site
   *
   * @returns {Object} site with metadata
   **/
  static _getMetadata(site)  {
    const imageWidth = 450;
    const imageHeight = 278;

    const promise = new Promise((resolve, reject) => {
      return fetch(site.url)
        .then((response) => response.text())
        .catch((ex) => resolve(site)) // can"t preview sites like localhost
        .then((domString) => {
          const pageMetadata = getMetadata(new DOMParser().parseFromString(domString, "text/html"));

          const imageUrl = pageMetadata.image_url;
          const description = pageMetadata.description;
          const iconUrl = pageMetadata.icon_url;

          if (imageUrl) {
            const images = [];
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
 * Rate limit to fire once every 250ms by default
 */
function rateLimit(fn, delay = 250, context) {
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
