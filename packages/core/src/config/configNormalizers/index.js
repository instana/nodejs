/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const disable = require('./disable');
const ignoreEndpoints = require('./ignoreEndpoints');

/**
 * @param {import('../../instanaCtr').InstanaCtrType} instanaCtr
 */
exports.init = function init(instanaCtr) {
  disable.init(instanaCtr);
  ignoreEndpoints.init(instanaCtr);
};

exports.disable = disable;
exports.ignoreEndpoints = ignoreEndpoints;
