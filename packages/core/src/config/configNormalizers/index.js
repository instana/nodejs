/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const disable = require('./disable');
const ignoreEndpoints = require('./ignoreEndpoints');
const secrets = require('./secrets');
const stackTrace = require('./stackTrace');

/**
 * @param {import('../../config').InstanaConfig} config
 */
exports.init = function init(config) {
  disable.init(config);
  ignoreEndpoints.init(config);
  secrets.init(config);
};

exports.disable = disable;
exports.ignoreEndpoints = ignoreEndpoints;
exports.secrets = secrets;
exports.stackTrace = stackTrace;
