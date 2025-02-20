/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const core = require('@instana/core');
const sharedMetrics = require('@instana/shared-metrics');
const { consoleLogger } = require('@instana/serverless');
const DataSource = require('../DataSource');

/**
 * This data source holds metrics from @instana/core and @instana/shared-metrics.
 * This source depends on external libraries.
 * The NodejsProcessor owns this source.
 *
 * A data source class defines how to collect or define data from a specific source.
 * The outside does not need to know how the data is collected.
 */
class CoreDataSource extends DataSource {
  constructor(config, refreshDelay) {
    super(refreshDelay);

    core.metrics.init(config);
    core.metrics.registerAdditionalMetrics(sharedMetrics.allMetrics);

    // This will be removed by the new logger refactoring PR.
    core.metrics.setLogger(consoleLogger);
  }

  activate() {
    if (!this.active) {
      core.metrics.activate();
    }

    super.activate();
  }

  deactivate() {
    if (this.active) {
      core.metrics.deactivate();
    }

    super.deactivate();
  }

  doRefresh(callback) {
    this.rawData = core.metrics.gatherData();
    process.nextTick(() => callback(null, this.rawData));
  }
}

module.exports = exports = CoreDataSource;
