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
      return;
    }
    const instrumentedContainerName = rootMetadata.Name;
    const taskArn = taskMetadata.TaskARN;
    const allContainerNames = taskMetadata.Containers.map(c => c.Name);
    const secondaryContainerNames = allContainerNames.filter(name => name !== instrumentedContainerName);
    const secondaryContainers = secondaryContainerNames.map(containerName => ({
      containerName,
      containerId: `${taskArn}::${containerName}`
    }));

    return { secondaryContainers };
  }
}

module.exports = exports = SecondaryContainerFactory;
