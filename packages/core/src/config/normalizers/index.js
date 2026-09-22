/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const disable = require('./disable');
const ignoreEndpoints = require('./ignoreEndpoints');
const stackTrace = require('./stackTrace');
const dbBindVariables = require('./dbBindVariables');

/**
 * @param {import('../../config').InstanaConfig} config
 */
exports.init = function init(config) {
  disable.init(config);
  ignoreEndpoints.init(config);
  dbBindVariables.init(config);
};

exports.disable = disable;
exports.ignoreEndpoints = ignoreEndpoints;
exports.stackTrace = stackTrace;
exports.dbBindVariables = dbBindVariables;
