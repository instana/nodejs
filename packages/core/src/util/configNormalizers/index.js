/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const ignoreEndpoints = require('./ignoreEndpoints');

/**
 * @param {import('../../util/normalizeConfig').InstanaConfig} config
 */
exports.init = function init(config) {
  ignoreEndpoints.init(config);
};
exports.ignoreEndpoints = ignoreEndpoints;
