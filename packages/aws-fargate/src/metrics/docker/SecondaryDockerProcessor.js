'use strict';

const DataProcessor = require('../DataProcessor');

const { convert } = require('./dockerUtil');

class SecondaryDockerProcessor extends DataProcessor {
  constructor(dataSource, containerName, containerId) {
    super('com.instana.plugin.docker');
    this.addSource('task', dataSource);
    this.containerName = containerName;
    this.entityId = containerId;
  }

  getEntityId() {
    return this.entityId;
  }

  processData(rawDataPerSource) {
    const metadata = rawDataPerSource.task;
    if (!metadata || !metadata.Containers) {
      return {};
    }
    const dataForThisContainer = metadata.Containers.find(container => container.Name === this.containerName);
    if (!dataForThisContainer) {
      return {};
    }
    const r = convert(dataForThisContainer);
    return r;
  }
}

module.exports = exports = SecondaryDockerProcessor;
