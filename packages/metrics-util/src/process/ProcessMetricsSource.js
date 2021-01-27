/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const DataSource = require('../DataSource');

/**
 * A source for metrics for the process entity.
 */
class ProcessDataSource extends DataSource {
  constructor(refreshDelay) {
    super(refreshDelay);
    this.previousTimestamp = Date.now();
    this.previousCpuUsage = process.cpuUsage();
  }

  doRefresh(callback) {
    const currentTimestamp = Date.now();
    let cpuUsageDiff;
    if (currentTimestamp <= this.previousTimestamp + 50) {
      // This can happen when the source is activated directly after being created. We skip the first measurement when
      // the time delta is too small.
      cpuUsageDiff = {};
    } else {
      cpuUsageDiff = process.cpuUsage(this.previousCpuUsage);
    }
    const previousTimestamp = this.previousTimestamp;
    this.previousTimestamp = currentTimestamp;
    this.previousCpuUsage = process.cpuUsage();

    process.nextTick(() => {
      callback(null, {
        cpuUsageDiff,
        timeDelta: currentTimestamp - previousTimestamp
      });
    });
  }
}

module.exports = exports = ProcessDataSource;
