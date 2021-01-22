/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. 2020
 */

'use strict';

const { consoleLogger } = require('@instana/serverless');

const transmissionCycle = require('./transmissionCycle');

let logger = consoleLogger;

const metadataHost = process.env.CUSTOM_METADATA_HOST || 'http://metadata.google.internal';
exports.metadataBaseUrl = `${metadataHost}/computeMetadata/v1/`;

exports.init = function init(config, onReady) {
  transmissionCycle.init(config, exports.metadataBaseUrl, onReady);
};

exports.activate = function activate() {
  transmissionCycle.activate();
};

exports.deactivate = function deactivate() {
  transmissionCycle.deactivate();
};

exports.setLogger = function setLogger(_logger) {
  logger = _logger;
  transmissionCycle.setLogger(logger);
};
