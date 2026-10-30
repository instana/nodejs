/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const common = require('./common');
const traces = require('./traces');
const metrics = require('./metrics');
const logs = require('./logs');

/**
 * @param {import('../config').InstanaConfig} config
 */
function init(config) {
  common.init(config);
  traces.init(config);
  metrics.init(config);
  logs.init(config);
}

module.exports = {
  init,
  common,
  traces,
  metrics,
  logs
};
