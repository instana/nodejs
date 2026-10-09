/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const resource = require('../../common/transformers/resource');
const { extractMappedMetrics } = require('./util');

/**
 * @param {Record<string, any>} metricsPayload
 * @param {Array<{ metricMappings: any[] }>} allMappings
 * @returns {Array<Record<string, any>>} OTLP metric objects
 */
function extractMetrics(metricsPayload, allMappings) {
  return allMappings.flatMap(mapper => extractMappedMetrics(metricsPayload, mapper));
}

module.exports = {
  resource,
  extractMetrics
};
