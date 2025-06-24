/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const disable = require('./disable');
const ignoreEndpoints = require('./ignoreEndpoints');

/**
 * @param {import('../../util/normalizeConfig').InstanaConfig} config
 */
exports.init = function init(config) {
  disable.init(config);
  ignoreEndpoints.init(config);
};

exports.disable = disable;
exports.ignoreEndpoints = ignoreEndpoints;
