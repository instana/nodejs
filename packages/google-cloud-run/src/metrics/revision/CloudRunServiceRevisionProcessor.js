'use strict';

const { DataProcessor } = require('@instana/metrics-util');

const identityProvider = require('../../identity_provider');

const port = process.env.PORT;
const service = process.env.K_SERVICE;
const configuration = process.env.K_CONFIGURATION;

class CloudRunServiceRevisionProcessor extends DataProcessor {
  constructor(projectDataSource, instanceDataSource) {
    super('com.instana.plugin.gcp.run.revision');
    this.addSource('project', projectDataSource);
    this.addSource('instance', instanceDataSource);
  }

  getEntityId() {
    return identityProvider.getRevision();
  }

  processData(rawDataPerSource) {
    const project = rawDataPerSource.project;
    const instance = rawDataPerSource.instance;
    return {
      runtime: 'node',
      region: extractRegionOrZone(instance.region),
      availabilityZone: extractRegionOrZone(instance.zone),
      instanceId: instance.id,
      service,
      configuration,
      revision: identityProvider.getRevision(),
      port,
      ...project
    };
  }
}

function extractRegionOrZone(fullyQualified) {
  if (typeof fullyQualified !== 'string') {
    return undefined;
  } else {
    const idx = fullyQualified.lastIndexOf('/');
    if (idx < 0 || idx >= fullyQualified.lenth - 1) {
      return undefined;
    }
    return fullyQualified.substring(idx + 1);
  }
}

module.exports = exports = CloudRunServiceRevisionProcessor;
