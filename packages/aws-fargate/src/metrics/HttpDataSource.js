'use strict';

const fetch = require('node-fetch');

const DataSource = require('./DataSource');

/**
 * A source for snapshot data and metrics that fetches raw JSON data from HTTP.
 */
class HttpDataSource extends DataSource {
  constructor(targetUrl, refreshDelay) {
    super(refreshDelay);
    this.targetUrl = targetUrl;
  }

  doRefresh(callback) {
    fetch(this.targetUrl)
      .then(res => res.text())
      .then(txt => JSON.parse(txt))
      .then(json => {
        callback(null, json);
      })
      .catch(e => {
        // eslint-disable-next-line no-console
        console.error(`Fetching metadata from ${this.targetUrl} failed.`, e);
        callback(e);
      });
  }
}
module.exports = exports = HttpDataSource;
