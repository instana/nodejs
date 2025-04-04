/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const transmissionCycle = require('./transmissionCycle');

let logger;
const metadataUriKey = 'ECS_CONTAINER_METADATA_URI';

exports.init = function init(config, onReady) {
  logger = config.logger;

  const metadataUri = process.env.ECS_CONTAINER_METADATA_URI;
  if (!metadataUri) {
    logger.error(`${metadataUriKey} is not set. This fargate task will not be monitored.`);
    return;
  }

  transmissionCycle.init(config, metadataUri, onReady);
};

exports.activate = function activate() {
  transmissionCycle.activate();
};

exports.deactivate = function deactivate() {
  transmissionCycle.deactivate();
};
