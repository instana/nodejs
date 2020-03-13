'use strict';

const DataProcessor = require('../DataProcessor');

const ProcessSnapshotDataSource = require('./ProcessSnapshotDataSource');
const ProcessMetricsSource = require('./ProcessMetricsSource');

class ProcessProcessor extends DataProcessor {
  constructor() {
    super('com.instana.plugin.process');
    this.snapshotDataSource = new ProcessSnapshotDataSource(5 * 60 * 1000);
    this.addSource('snapshot', this.snapshotDataSource);
    this.addSource('metrics', new ProcessMetricsSource());
  }

  getEntityId() {
    if (this.entityId != null) {
      return this.entityId;
    }
    const rawData = this._compileRawData();
    if (!rawData.snapshot) {
      return null;
    }
    this.entityId = rawData.snapshot.pid;
    return this.entityId;
  }

  setExternalSnapshotData(ecsContainerData) {
    this.snapshotDataSource.setExternalSnapshotData(ecsContainerData.dockerId, ecsContainerData.taskArn);
  }

  processData(rawDataPerSource) {
    const { snapshot, metrics } = rawDataPerSource;
    const divisor = metrics.timeDelta * 1000;
    let user;
    let sys;
    if (metrics.cpuUsageDiff.user) {
      user = metrics.cpuUsageDiff.user / divisor;
    }
    if (metrics.cpuUsageDiff.system) {
      sys = metrics.cpuUsageDiff.system / divisor;
    }
    let cpu;
    if (user || sys) {
      cpu = { user, sys };
    }
    return {
      ...snapshot,
      cpu
    };
  }
}

module.exports = exports = ProcessProcessor;
