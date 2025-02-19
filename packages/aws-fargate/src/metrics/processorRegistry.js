/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const metricsUtil = require('@instana/metrics-util');

const InstrumentedEcsContainerProcessor = require('./container/InstrumentedEcsContainerProcessor');
const SecondaryEcsContainerFactory = require('./container/SecondaryEcsContainerFactory');
const SecondaryEcsContainerProcessor = require('./container/SecondaryEcsContainerProcessor');
const EcsTaskProcessor = require('./task/EcsTaskProcessor');
const InstrumentedDockerProcessor = require('./docker/InstrumentedDockerProcessor');
const SecondaryDockerProcessor = require('./docker/SecondaryDockerProcessor');

const allProcessors = [];

exports.init = function init(config, metadataUri, onReady) {
  const oneMinute = 60 * 1000;

  // Common processors from metrics-util
  const metadataRootDataSource = new metricsUtil.HttpDataSource(metadataUri, oneMinute);
  const metadataTaskDataSource = new metricsUtil.HttpDataSource(`${metadataUri}/task`, oneMinute);
  const metadataRootStatsDataSource = new metricsUtil.HttpDataSource(`${metadataUri}/stats`);
  const metadataTaskStatsDataSource = new metricsUtil.HttpDataSource(`${metadataUri}/task/stats`);
  const coreAndSharedMetricsDataSource = new metricsUtil.nodejs.CoreDataSource(config);
  const nodeJsProcessor = new metricsUtil.nodejs.NodeJsProcessor(coreAndSharedMetricsDataSource, process.pid);
  const processProcessor = new metricsUtil.process.ProcessProcessor('docker');

  // Local fargate specific processors
  const ecsTaskProcessor = new EcsTaskProcessor(metadataTaskDataSource);
  const instrumentedEcsContainerProcessor = new InstrumentedEcsContainerProcessor(metadataRootDataSource);
  const instrumentedDockerProcessor = new InstrumentedDockerProcessor(
    metadataRootDataSource,
    metadataRootStatsDataSource
  );

  allProcessors.push(ecsTaskProcessor);
  allProcessors.push(instrumentedEcsContainerProcessor);
  allProcessors.push(instrumentedDockerProcessor);
  allProcessors.push(processProcessor);
  allProcessors.push(nodeJsProcessor);

  instrumentedEcsContainerProcessor.once('ready', ecsContainerPayload => {
    onReady(null, ecsContainerPayload);
    setAdditionalMetadata(processProcessor, ecsContainerPayload);
  });

  // Activate processors and data sources directly in #init (instead of in #activate) to fetch the initial snapshot
  // data for the ECS task. This needs to happen before the rest of the components can be activated (for example, to
  // get the entity ID for the task).
  allProcessors.forEach(processor => processor.activate());

  const secondaryEcsContainerFactory = new SecondaryEcsContainerFactory(metadataRootDataSource, metadataTaskDataSource);
  secondaryEcsContainerFactory.once('ready', secondaryContainers => {
    secondaryContainers.data.secondaryContainers.forEach(({ dockerId, containerId }) => {
      const secondaryEcsContainerProcessor = new SecondaryEcsContainerProcessor(
        metadataTaskDataSource,
        dockerId,
        containerId
      );
      secondaryEcsContainerProcessor.activate();
      allProcessors.push(secondaryEcsContainerProcessor);
      const secondaryDockerProcessor = new SecondaryDockerProcessor(
        metadataTaskDataSource,
        metadataTaskStatsDataSource,
        dockerId,
        containerId
      );
      secondaryDockerProcessor.activate();
      allProcessors.push(secondaryDockerProcessor);
    });
  });
  secondaryEcsContainerFactory.activate();
};

exports.activate = function activate() {
  // The processors have been activated in init already, this is just to make sure they also get activated in a
  // (rather hypothetical) init -> deactivate -> activate scenario.
  allProcessors.forEach(processor => processor.activate());
};

exports.deactivate = function deactivate() {
  allProcessors.forEach(processor => processor.deactivate());
};

function setAdditionalMetadata(processProcessor, ecsContainerPayload) {
  const ecsContainerData = ecsContainerPayload.data || {};
  processProcessor.setExternalSnapshotData(ecsContainerData.dockerId, ecsContainerData.taskArn);
}

exports.forEachProcessor = function forEachProcessor(fn) {
  allProcessors.forEach(fn);
};
