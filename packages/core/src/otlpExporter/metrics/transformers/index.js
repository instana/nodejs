/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const resource = require('../../common/transformers/resource');
const runtimeMetrics = require('./runtimeMetrics');

/**
 * @param {Record<string, any>} metricsPayload
 * @param {Array<{ metricMappings: any[] }>} allMappings
 * @returns {Array<Record<string, any>>} OTLP metric objects
 */
function extractMetrics(metricsPayload, allMappings) {
  return allMappings.flatMap(mapper => runtimeMetrics.extractMetrics(metricsPayload, mapper));
}

module.exports = {
  resource,
  runtimeMetrics,
  extractMetrics
};
