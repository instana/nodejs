/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const common = require('./common');
const traces = require('./traces');
const metrics = require('./metrics');

/**
 * @param {import('../config').InstanaConfig} config
 */
function init(config) {
  common.init(config);
  traces.init(config);
  metrics.init(config);
}

module.exports = {
  init,
  common,
  traces,
  metrics
};
