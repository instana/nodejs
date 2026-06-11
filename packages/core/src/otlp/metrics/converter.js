/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const otlpCtx = require('../common/context');
const { flattenObject } = require('./util');
const transformers = require('./transformers');
const resourceFactory = require('../common/resource');

const SCOPE = {
  name: resourceFactory.SCOPE_NAME,
  version: resourceFactory.SCOPE_VERSION
};

let logger;

/**
 * Initializes configuration contexts
 */
function init(config) {
  logger = config?.logger;
}

/**
 * Legacy Stateful Facade Setters mapping to global contexts
 */
function setHostId(hostId) {
  otlpCtx.setHostId(hostId);
}

function setPid(pid) {
  otlpCtx.setPid(pid);
}

/**
 * Normalizes incoming data structures safely
 */
function normalizeMetrics(instanaMetrics) {
  if (!instanaMetrics) return [];

  // Case A: Input array directly (e.g., simple-metrics.json)
  if (Array.isArray(instanaMetrics)) {
    const result = [];
    for (let i = 0; i < instanaMetrics.length; i++) {
      const item = instanaMetrics[i];
      if (!item) continue;

      result.push({
        name: item.name,
        value: item.value,
        // FIX: Prioritize the item's own timestamp parameter, only use clock if missing!
        timestamp: item.timestamp || Date.now(),
        unit: item.unit || '',
        from: item.from
      });
    }
    return result;
  }

  // Case B: Deeply nested objects (e.g., nested-metrics.json)
  if (typeof instanaMetrics === 'object') {
    const { from, timestamp, ...metricsData } = instanaMetrics;
    const flattened = flattenObject(metricsData);
    const flattenedKeys = Object.keys(flattened);
    const result = [];

    const fallbackTimestamp = timestamp || instanaMetrics.timestamp || Date.now();

    for (let i = 0; i < flattenedKeys.length; i++) {
      const key = flattenedKeys[i];
      result.push({
        name: key,
        value: flattened[key],
        timestamp: fallbackTimestamp,
        unit: '',
        from: from
      });
    }
    return result;
  }

  return [];
}

/**
 * High-performance core conversion loop execution
 */
function convert(instanaMetrics) {
  const metricsArray = normalizeMetrics(instanaMetrics);
  const len = metricsArray.length;

  if (len === 0) {
    return { resourceMetrics: [] };
  }

  const resourceGroupMap = new Map();

  for (let i = 0; i < len; i++) {
    const rawMetric = metricsArray[i];
    if (!rawMetric) continue;

    try {
      const mappedMetric = transformers.metricData.extractMetricData(rawMetric);
      if (!mappedMetric) continue;

      const originFrom = rawMetric.from || null;
      const rKey = resourceFactory.getResourceKey(originFrom);

      if (!resourceGroupMap.has(rKey)) {
        resourceGroupMap.set(rKey, {
          representativePayload: rawMetric,
          otelMetrics: []
        });
      }

      resourceGroupMap.get(rKey).otelMetrics.push(mappedMetric);
    } catch (error) {
      if (logger && typeof logger.debug === 'function') {
        logger.debug('Failed to transform individual OTLP metric data block:', error);
      }
    }
  }

  const resourceMetrics = [];
  const groups = Array.from(resourceGroupMap.values());
  const groupLen = groups.length;

  for (let j = 0; j < groupLen; j++) {
    const group = groups[j];

    resourceMetrics.push({
      resource: resourceFactory.extractResourceAttributes(group.representativePayload),
      scopeMetrics: [
        {
          scope: SCOPE,
          metrics: group.otelMetrics
        }
      ]
    });
  }

  return { resourceMetrics };
}

module.exports = {
  init,
  setHostId,
  setPid,
  convert
};
