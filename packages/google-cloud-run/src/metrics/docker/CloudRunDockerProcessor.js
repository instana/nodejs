'use strict';

const { DataProcessor } = require('@instana/metrics-util');

const identityProvider = require('../../identity_provider');

class CloudRunDockerProcessor extends DataProcessor {
  constructor(instanceDataSource) {
    super('com.instana.plugin.docker');
    this.addSource('instance', instanceDataSource);
  }

  getEntityId() {
    return identityProvider.getContainerInstanceId();
  }

  processData(rawDataPerSource) {
    const instance = rawDataPerSource.instance;
    return {
      Id: instance.id
    };
  }
}

module.exports = exports = CloudRunDockerProcessor;
