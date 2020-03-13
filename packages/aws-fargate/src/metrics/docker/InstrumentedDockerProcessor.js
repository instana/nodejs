'use strict';

const DataProcessor = require('../DataProcessor');

const { convert } = require('./dockerUtil');
const { fullyQualifiedContainerId } = require('../container/containerUtil');

class InstrumentedDockerProcessor extends DataProcessor {
  constructor(dataSource) {
    super('com.instana.plugin.docker');
    this.addSource('root', dataSource);
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

  processData(rawDataPerSource) {
    const data = rawDataPerSource.root;
    return convert(data);
  }
}

module.exports = exports = InstrumentedDockerProcessor;
