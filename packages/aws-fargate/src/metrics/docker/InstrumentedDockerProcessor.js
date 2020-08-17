'use strict';

const { DataProcessor } = require('@instana/metrics-util');

const { convert } = require('./dockerUtil');
const { fullyQualifiedContainerId } = require('../container/containerUtil');

class InstrumentedDockerProcessor extends DataProcessor {
  constructor(rootDataSource, statsDataSource) {
    super('com.instana.plugin.docker');
    this.addSource('root', rootDataSource);
    this.addSource('rootStats', statsDataSource, false);
  }

  getEntityId() {
    if (this.entityId != null) {
      return this.entityId;
    }
    const rawData = this._compileRawData();
    if (
      !rawData.root ||
      !rawData.root.Labels ||
      !rawData.root.Labels['com.amazonaws.ecs.task-arn'] ||
      !rawData.root.Name
    ) {
      return null;
    }
    this.entityId = fullyQualifiedContainerId(rawData.root.Labels['com.amazonaws.ecs.task-arn'], rawData.root.Name);
    return this.entityId;
  }

  processData(rawDataPerSource, previous, next) {
    return convert(rawDataPerSource.root, rawDataPerSource.rootStats, previous, next);
  }
}

module.exports = exports = InstrumentedDockerProcessor;
