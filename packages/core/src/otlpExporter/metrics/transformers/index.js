/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const resource = require('../../common/transformers/resource');
const runtimeMetrics = require('./runtimeMetrics');

module.exports = {
  resource,
  /** Engine: iterates mapper.metricMappings → OTLP metric array */
  runtimeMetrics
};
