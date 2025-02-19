/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const DataProcessor = require('../DataProcessor');

class NodeJsProcessor extends DataProcessor {
  constructor(coreAndSharedMetricsDataSource, pid) {
    super('com.instana.plugin.nodejs');
    this.pid = pid;
    this.addSource('core', coreAndSharedMetricsDataSource);
  }

  getEntityId() {
    return this.pid;
  }

  processData(rawDataPerSource) {
    return { ...rawDataPerSource.core, pid: this.pid };
  }
}

module.exports = exports = NodeJsProcessor;
