'use strict';

const DataProcessor = require('../DataProcessor');
const { convert, fullyQualifiedContainerId } = require('./containerUtil');

class InstrumentedEcsContainerProcessor extends DataProcessor {
  constructor(dataSource) {
    super('com.instana.plugin.aws.ecs.container');
    this.addSource('snapshot', dataSource);
  }

  getEntityId() {
    if (this.entityId != null) {
      return this.entityId;
    }
    const rawData = this._compileRawData();
    if (
      !rawData.snapshot ||
      !rawData.snapshot.Labels ||
      !rawData.snapshot.Labels['com.amazonaws.ecs.task-arn'] ||
      !rawData.snapshot.Name
    ) {
      return null;
    }
    this.entityId = fullyQualifiedContainerId(
      rawData.snapshot.Labels['com.amazonaws.ecs.task-arn'],
      rawData.snapshot.Name
    );
    return this.entityId;
  }

  processData(rawDataPerSource) {
    const metadata = rawDataPerSource.snapshot;
    return {
      runtime: 'node',
      instrumented: true,
      ...convert(metadata)
    };
  }
}

module.exports = exports = InstrumentedEcsContainerProcessor;
