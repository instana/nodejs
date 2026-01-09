/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const DataSource = require('./DataSource');

/**
 * A source for snapshot data and metrics that fetches raw JSON data from HTTP.
 */
class HttpDataSource extends DataSource {
  constructor(targetUrl, refreshDelay, fetchOptions) {
    super(refreshDelay);
    this.targetUrl = targetUrl;
    this.fetchOptions = fetchOptions;
  }

  doRefresh(callback) {
    fetch(this.targetUrl, this.fetchOptions)
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
