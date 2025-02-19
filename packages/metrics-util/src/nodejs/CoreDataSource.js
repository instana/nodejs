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
 * A source for snapshot data and metrics that adapts the metrics
 * from @instana/core and @instana/shared-metrics.
 *
 * `activate` will be called from the registry.
 * The NodejsProcessor owns the CoreDataSource.
 *
 * > allProcessors.forEach(processor => processor.activate());
 *
 * This will activate core & shared-metrics.
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
    core.metrics.activate();
    super.activate();
  }

  deactivate() {
    core.metrics.deactivate();
    super.deactivate();
  }

  doRefresh(callback) {
    this.rawData = core.metrics.gatherData();
    process.nextTick(() => callback(null, this.rawData));
  }
}

module.exports = exports = CoreDataSource;
