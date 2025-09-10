/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

// max time spend waiting for an agent response
exports.requestTimeout = 5000;
// @ts-ignore - Cannot redeclare exported variable
exports.host = '127.0.0.1';
// @ts-ignore - Cannot redeclare exported variable
exports.port = 42699;
/** @type {string} */
exports.agentUuid = undefined;
// @ts-ignore - Cannot redeclare exported variable
exports.autoProfile = false;

/** @type {import('@instana/core/src/config/normalizeConfig').AgentConfig} config */
exports.config = {};

/**
 * @param {import('../types/collector').CollectorConfig} config
 */
exports.init = function init(config) {
  // @ts-ignore - Cannot redeclare exported variable
  exports.host = config.agentHost;
  // @ts-ignore - Cannot redeclare exported variable
  exports.port = config.agentPort;

  // TODO: Why is autoProfile part of agentOpts? O_o
  // @ts-ignore - Cannot redeclare exported variable
  exports.autoProfile = config.autoProfile;
};
