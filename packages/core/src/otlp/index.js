/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const traces = require('./traces/index');
const metrics = require('./metrics/index');
const ctx = require('./common/context');

/**
 * @param {Object} config
 */
function init(config) {
  ctx.init(config);
  traces.init(config);
  metrics.init(config);
}

module.exports = {
  init,
  traces,
  metrics
};
