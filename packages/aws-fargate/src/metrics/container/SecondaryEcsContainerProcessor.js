'use strict';

const { DataProcessor } = require('@instana/metrics-util');

const { convert } = require('./containerUtil');
const { dataForSecondaryContainer } = require('./containerUtil');

class SecondaryEcsContainerProcessor extends DataProcessor {
  constructor(taskDataSource, dockerId, containerId) {
    super('com.instana.plugin.aws.ecs.container');
    this.addSource('task', taskDataSource);
    this.dockerId = dockerId;
    this.entityId = containerId;
  }

  getEntityId() {
    return this.entityId;
  }

  processData(rawDataPerSource) {
    const snapshotDataForThisContainer = dataForSecondaryContainer(rawDataPerSource.task, this.dockerId);
    return convert(snapshotDataForThisContainer);
  }
}

module.exports = exports = SecondaryEcsContainerProcessor;
