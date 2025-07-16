/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const { DataProcessor } = require('@instana/metrics-util');

const identityProvider = require('../../identity_provider');

const port = process.env.PORT;
const service = process.env.K_SERVICE;
const configuration = process.env.K_CONFIGURATION;

class CloudRunServiceRevisionInstanceProcessor extends DataProcessor {
  constructor(projectDataSource, instanceDataSource) {
    super('com.instana.plugin.gcp.run.revision.instance', [
      // compressionExcludeList:
      ['revision'],
      ['numericProjectId'],
      ['region']
    ]);
    this.addSource('project', projectDataSource);
    this.addSource('instance', instanceDataSource);
  }

  getEntityId() {
    return identityProvider.getContainerInstanceId();
  }

  processData(rawDataPerSource) {
    const project = rawDataPerSource.project;
    const instance = rawDataPerSource.instance;
    return {
      runtime: 'node',
      region: extractRegion(instance.region),
      instanceId: instance.id,
      service,
      configuration,
      revision: identityProvider.getRevision(),
      port,
      // ...project provides two attributes, numericProjectId and projectId.
      ...project
    };
  }
}

function extractRegion(fullyQualified) {
  if (typeof fullyQualified !== 'string') {
    return undefined;
  } else {
    const idx = fullyQualified.lastIndexOf('/');
    if (idx < 0 || idx >= fullyQualified.length - 1) {
      return undefined;
    }
    return fullyQualified.substring(idx + 1);
  }
}

module.exports = exports = CloudRunServiceRevisionInstanceProcessor;
