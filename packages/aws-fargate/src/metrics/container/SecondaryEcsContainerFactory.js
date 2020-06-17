'use strict';

const DataProcessor = require('../DataProcessor');

/**
 * Uses the response from ${metadataUri}/task to create processors for all secondary (non-instrumented containers).
 */
class SecondaryContainerFactory extends DataProcessor {
  constructor(rootDataSource, taskDataSource) {
    super('com.instana.plugin.dummy');
    this.addSource('root', rootDataSource);
    this.addSource('task', taskDataSource);
  }

  getEntityId() {
    // does not participate in producing entity data
    return null;
  }

  processData(rawDataPerSource) {
    const rootMetadata = rawDataPerSource.root;
    const taskMetadata = rawDataPerSource.task;
    if (
      !rootMetadata ||
      rootMetadata.Name == null ||
      !taskMetadata ||
      taskMetadata.TaskARN == null ||
      !taskMetadata.Containers
    ) {
      return {};
    }
    const instrumentedDockerId = rootMetadata.DockerId;
    const taskArn = taskMetadata.TaskARN;
    const secondaryContainers = taskMetadata.Containers.map(c => ({
      dockerId: c.DockerId,
      containerId: `${taskArn}::${c.Name}`
    })).filter(({ dockerId }) => dockerId !== instrumentedDockerId);
    return { secondaryContainers };
  }
}

module.exports = exports = SecondaryContainerFactory;
