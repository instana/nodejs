/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const metricsUtil = require('@instana/metrics-util');

const CloudRunServiceRevisionInstanceProcessor = require('./instance/CloudRunServiceRevisionInstanceProcessor');
const identityProvider = require('../identity_provider');

const allProcessors = [];

exports.init = function init(config, metadataBaseUrl, onReady) {
  const neverRefresh = 2147483647; // max 32 bit int = max value for setTimeout
  const fetchOptions = {
    headers: { 'Metadata-Flavor': 'Google' }
  };

  // Common processors from metrics-util
  const projectDataSource = new metricsUtil.HttpDataSource(
    `${metadataBaseUrl}project/?recursive=true`,
    neverRefresh,
    fetchOptions
  );
  const instanceDataSource = new metricsUtil.HttpDataSource(
    `${metadataBaseUrl}instance/?recursive=true`,
    neverRefresh,
    fetchOptions
  );
  const processProcessor = new metricsUtil.process.ProcessProcessor(
    'gcpCloudRunInstance',
    identityProvider.getHostHeader()
  );
  const coreAndSharedMetricsDataSource = new metricsUtil.nodejs.CoreDataSource(config);
  const nodeJsProcessor = new metricsUtil.nodejs.NodeJsProcessor(coreAndSharedMetricsDataSource, process.pid);

  // Local GC processors
  const cloudRunServiceRevisionProcessor = new CloudRunServiceRevisionInstanceProcessor(
    projectDataSource,
    instanceDataSource
  );

  allProcessors.push(cloudRunServiceRevisionProcessor);
  allProcessors.push(processProcessor);
  allProcessors.push(nodeJsProcessor);

  cloudRunServiceRevisionProcessor.once('ready', payload => {
    if (onReady) {
      onReady(null, payload);
    }
    setAdditionalMetadata(processProcessor, payload && payload.data ? payload.data.instanceId : null);
  });

  // Activate processors and data sources directly in #init (instead of in #activate) to fetch the initial snapshot
  // data for the service revision. This needs to happen before the rest of the components can be activated (to get the
  // container instance ID).
  allProcessors.forEach(processor => processor.activate());
};

exports.activate = function activate() {
  // The processors have been activated in init already, this is just to make sure they also get activated in a
  // (rather hypothetical) init -> deactivate -> activate scenario.
  allProcessors.forEach(processor => processor.activate());
};

exports.deactivate = function deactivate() {
  allProcessors.forEach(processor => processor.deactivate());
};

function setAdditionalMetadata(processProcessor, containerInstanceId) {
  processProcessor.setExternalSnapshotData(containerInstanceId);
}

exports.forEachProcessor = function forEachProcessor(fn) {
  allProcessors.forEach(fn);
};
