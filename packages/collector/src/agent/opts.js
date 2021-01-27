/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

// max time spend waiting for an agent response
exports.requestTimeout = 5000;
exports.host = '127.0.0.1';
exports.port = 42699;
exports.agentUuid = undefined;
exports.autoProfile = false;

exports.init = function init(config) {
  exports.host = config.agentHost;
  exports.port = config.agentPort;
  exports.autoProfile = config.autoProfile;
};
