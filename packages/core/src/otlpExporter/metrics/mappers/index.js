/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const runtimeMetricsMappings = require('./runtimeMetricsMappings');

const allMappings = [
  runtimeMetricsMappings
  // future: httpMetricsMappings,
];

module.exports = { allMappings };
