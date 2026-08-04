/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const runtimeMetricsMappings = require('./runtimeMetricsMappings');

module.exports = {
  get allMappings() {
    return [
      runtimeMetricsMappings
      // future: httpMetricsMappings,
    ];
  }
};
