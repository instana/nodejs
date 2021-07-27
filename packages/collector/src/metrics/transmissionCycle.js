/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const { clone, compression } = require('@instana/core').util;

/** @type {import('@instana/core/src/logger').GenericLogger} */
let logger;
logger = require('../logger').getLogger('metrics/sender', newLogger => {
  logger = newLogger;
});

const resendFullDataEveryXTransmissions = 300; /* about every 5 minutes */
let transmissionsSinceLastFullDataEmit = 0;

/** @type {import('./')} */
let metrics;
/** @type {import('../agentConnection')} */
let downstreamConnection;
/** @type {(requests: Array.<import('../agent/requestHandler').AnnounceRequest>) => void} */
let onSuccess;
/** @type {() => void} */
let onError;

/** @type {Object.<string, *>} */
let previousTransmittedValue;
/** @type {NodeJS.Timeout} */
let transmissionTimeoutHandle;
let transmissionDelay = 1000;
let isActive = false;

/**
 * @param {import('@instana/core/src/metrics').InstanaConfig} config
 */
exports.init = function init(config) {
  transmissionDelay = config.metrics.transmissionDelay;
};

/**
 * @param {import('./')} _metrics
 * @param {import('../agentConnection')} _downstreamConnection
 * @param {(requests: Array.<import('../agent/requestHandler').AnnounceRequest>) => void} _onSuccess
 * @param {() => void} _onError
 * @returns
 */
exports.activate = function activate(_metrics, _downstreamConnection, _onSuccess, _onError) {
  metrics = _metrics;
  downstreamConnection = _downstreamConnection;
  onSuccess = _onSuccess;
  onError = _onError;

  if (!metrics) {
    logger.error('No metrics have been set.');
    return;
  }
  if (!metrics.gatherData) {
    logger.error('Configured metrics have no attribute "gatherData".');
    return;
  }
  if (typeof metrics.gatherData !== 'function') {
    logger.error('metrics.gatherData is not a function.');
    return;
  }
  if (!downstreamConnection) {
    logger.error('No downstreamConnection has been set.');
    return;
  }
  if (!downstreamConnection.sendMetrics) {
    logger.error('Configured downstreamConnection has no attribute "sendMetrics".');
    return;
  }
  if (typeof downstreamConnection.sendMetrics !== 'function') {
    logger.error('downstreamConnection.sendMetrics is not a function.');
    return;
  }

  isActive = true;

  transmissionsSinceLastFullDataEmit = 0;
  sendMetrics();
};

function sendMetrics() {
  if (!isActive) {
    return;
  }

  // clone retrieved objects to allow mutations in metric retrievers
  const newValueToTransmit = clone(metrics.gatherData());

  /** @type {Object<string, *>} */
  let payload;
  const isFullTransmission = transmissionsSinceLastFullDataEmit > resendFullDataEveryXTransmissions;
  if (isFullTransmission) {
    payload = newValueToTransmit;
  } else {
    payload = compression(previousTransmittedValue, newValueToTransmit);
  }

  downstreamConnection.sendMetrics(payload, onMetricsHaveBeenSent.bind(null, isFullTransmission, newValueToTransmit));
}

/**
 * @param {boolean} isFullTransmission
 * @param {Object.<string, *>} transmittedValue
 * @param {Error} error
 * @param {Array.<import('../agent/requestHandler').AnnounceRequest>} responsePayload
 */
function onMetricsHaveBeenSent(isFullTransmission, transmittedValue, error, responsePayload) {
  if (error) {
    logger.error('Error received while trying to send snapshot data and metrics: %s', error.message);
    if (onError) {
      onError();
    }
    return;
  }
  previousTransmittedValue = transmittedValue;
  if (isFullTransmission) {
    transmissionsSinceLastFullDataEmit = 0;
  } else {
    transmissionsSinceLastFullDataEmit++;
  }
  if (onSuccess) {
    onSuccess(responsePayload);
  }
  transmissionTimeoutHandle = setTimeout(sendMetrics, transmissionDelay);
  transmissionTimeoutHandle.unref();
}

exports.deactivate = function deactivate() {
  isActive = false;
  previousTransmittedValue = undefined;
  clearTimeout(transmissionTimeoutHandle);
};
