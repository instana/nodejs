/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. 2020
 */

'use strict';

const {
  HttpDataSource,
  nodejs: { coreAndShared, NodeJsProcessor },
  process: { ProcessProcessor }
} = require('@instana/metrics-util');

const InstrumentedEcsContainerProcessor = require('./container/InstrumentedEcsContainerProcessor');
const SecondaryEcsContainerFactory = require('./container/SecondaryEcsContainerFactory');
const SecondaryEcsContainerProcessor = require('./container/SecondaryEcsContainerProcessor');
const EcsTaskProcessor = require('./task/EcsTaskProcessor');
const InstrumentedDockerProcessor = require('./docker/InstrumentedDockerProcessor');
const SecondaryDockerProcessor = require('./docker/SecondaryDockerProcessor');

const allProcessors = [];

exports.init = function init(config, metadataUri, onReady) {
  coreAndShared.init(config);

  const oneMinute = 60 * 1000;
  const metadataRootDataSource = new HttpDataSource(metadataUri, oneMinute);
  const metadataTaskDataSource = new HttpDataSource(`${metadataUri}/task`, oneMinute);
  const metadataRootStatsDataSource = new HttpDataSource(`${metadataUri}/stats`);
  const metadataTaskStatsDataSource = new HttpDataSource(`${metadataUri}/task/stats`);

  const ecsTaskProcessor = new EcsTaskProcessor(metadataTaskDataSource);
  allProcessors.push(ecsTaskProcessor);
  const instrumentedEcsContainerProcessor = new InstrumentedEcsContainerProcessor(metadataRootDataSource);
  allProcessors.push(instrumentedEcsContainerProcessor);
  allProcessors.push(new InstrumentedDockerProcessor(metadataRootDataSource, metadataRootStatsDataSource));

  const processProcessor = new ProcessProcessor('docker');
  allProcessors.push(processProcessor);
  allProcessors.push(new NodeJsProcessor(coreAndShared, process.pid));

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
