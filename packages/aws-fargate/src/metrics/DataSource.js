'use strict';

const EventEmitter = require('events');

/**
 * A base class for sources for snapshot data and metrics.
 */
class DataSource extends EventEmitter {
  constructor(refreshDelay) {
    super();
    this.refreshDelay = refreshDelay == null ? 1000 : refreshDelay;
    this.refreshTimeoutHandle = null;
    this.reset();
    this.active = false;
  }

  activate() {
    if (!this.refreshTimeoutHandle) {
      this._refresh();
    }
    this.active = true;
  }

  deactivate() {
    this.active = false;
    if (this.refreshTimeoutHandle) {
      clearTimeout(this.refreshTimeoutHandle);
    }
    this.refreshTimeoutHandle = null;
  }

  _refresh() {
    this.doRefresh((err, data) => {
      if (err) {
        // If this source has a refresh delay greater than one minute we force it to try again in one minute after a
        // failed refresh. Otherwise sources with very long refresh delays would not self heal from a single failed
        // refresh in a reasonable time.
        if (this.refreshDelay > 60000) {
          clearTimeout(this.refreshTimeoutHandle);
          this.refreshTimeoutHandle = setTimeout(() => this._refresh(), 60000);
          this.refreshTimeoutHandle.unref();
        }
        // Ignore silently, the individual source should log the error.
        return;
      }
      this.rawData = data;
      if (this.refreshTimestamp == null) {
        this.refreshTimestamp = Date.now();
        this.emit('firstRefresh', this.rawData);
      } else {
        this.refreshTimestamp = Date.now();
      }
    });
    clearTimeout(this.refreshTimeoutHandle);
    this.refreshTimeoutHandle = setTimeout(() => this._refresh(), this.refreshDelay);
    this.refreshTimeoutHandle.unref();
  }

  doRefresh() {
    throw new Error('DataSource needs to override doRefresh.');
  }

  getRawData() {
    return this.rawData;
  }

  reset() {
    this.rawData = {};
    this.refreshTimestamp = null;
  }

  hasRefreshedAtLeastOnce() {
    return this.refreshTimestamp != null;
  }

  getLastRefreshTimestamp() {
    return this.refreshTimestamp;
  }
}

module.exports = exports = DataSource;
