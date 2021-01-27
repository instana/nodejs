/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const DataSource = require('../DataSource');

/**
 * A source for snapshot data and metrics that adapts the metrics from @instana/core and @instana/shared-metrics.
 */
class CoreDataSource extends DataSource {
  constructor(coreMetrics, refreshDelay) {
    super(refreshDelay);
    this.coreMetrics = coreMetrics;
  }

  activate() {
    if (!this.active) {
      this.coreMetrics.activate();
    }
    super.activate();
  }

  deactivate() {
    if (this.active) {
      this.coreMetrics.deactivate();
    }
    super.deactivate();
  }

  doRefresh(callback) {
    this.rawData = this.coreMetrics.gatherData();
    process.nextTick(() => callback(null, this.rawData));
  }
}

module.exports = exports = CoreDataSource;
