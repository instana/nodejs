/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const { backendConnector } = require('@instana/serverless');
const processorRegistry = require('./processorRegistry');

let logger;
let transmissionDelay = 1000;
let transmissionTimeoutHandle;
let isActive = false;

exports.init = function init(config, metadataBaseUrl, onReady) {
  logger = config.logger;
  transmissionDelay = config.metrics.transmissionDelay;
  processorRegistry.init(config, metadataBaseUrl, onReady);
};

exports.activate = function activate() {
  isActive = true;
  processorRegistry.activate();
  sendMetrics();
};

exports.deactivate = function deactivate() {
  isActive = false;
  processorRegistry.deactivate();
  clearTimeout(transmissionTimeoutHandle);
};

function sendMetrics() {
  if (!isActive) {
    return;
  }

  const payload = { plugins: [] };
  const uncompressedPerProcessor = {};

  processorRegistry.forEachProcessor(processor => {
    if (processor.isReady()) {
      const uncompressedData = processor.getUncompressedData(true);
      uncompressedPerProcessor[processor.getId()] = uncompressedData;
      if (uncompressedData) {
        const compressedData = processor.compress(uncompressedData);
        payload.plugins.push(processor.wrapAsPayload(compressedData));
      }
    }
  });

  if (payload.plugins.length === 0) {
    // nothing to report, simply schedule next transmission
    clearTimeout(transmissionTimeoutHandle);
    transmissionTimeoutHandle = setTimeout(sendMetrics, transmissionDelay);
    transmissionTimeoutHandle.unref();
    return;
  }

  backendConnector.sendMetrics(payload, onMetricsHaveBeenSent.bind(null, uncompressedPerProcessor));
}

function onMetricsHaveBeenSent(transmittedPayloadPerProcessor, error) {
  // schedule next transmission, no matter if success or error
  clearTimeout(transmissionTimeoutHandle);
  transmissionTimeoutHandle = setTimeout(sendMetrics, transmissionDelay);
  transmissionTimeoutHandle.unref();

  if (error) {
    return;
  }

  processorRegistry.forEachProcessor(processor => {
    processor.setLastTransmittedPayload(transmittedPayloadPerProcessor[processor.getId()]);
  });
}
