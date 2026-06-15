/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const otlpCtx = require('../common/context');
const { normalizeMetrics } = require('./util');
const transformers = require('./transformers');

const SCOPE = {
  name: transformers.resource.SCOPE_NAME,
  version: transformers.resource.SCOPE_VERSION
};

let logger;

/**
 * @param {import('../../config').InstanaConfig} config
 */
function init(config) {
  logger = config?.logger;
}

/**
 * @param {any} hostId
 */
function setHostId(hostId) {
  otlpCtx.setHostId(hostId);
}

/**
 * @param {any} pid
 */
function setPid(pid) {
  otlpCtx.setPid(pid);
}

/**
 * TODO: This conversion is incomplete, its only for the design
 * for now memory is only converterd to OTLP, all other metrics skipped
 */
function convert(metrics) {
  const metricsArray = normalizeMetrics(metrics);
  if (metricsArray.length === 0) return { resourceMetrics: [] };

  // The service name can be convered from merics, not all metrics have this service name in payload
  // If service name is not loaded from config we use the value
  if (metrics?.name && typeof metrics.name === 'string') {
    if (!otlpCtx._serviceName) {
      otlpCtx.setServiceName(metrics.name);
    }
  }

  const otelMetrics = metricsArray
    .map(rawMetric => {
      try {
        return transformers.metricData.extractMetricData(rawMetric);
      } catch (error) {
        if (logger?.debug) {
          logger.debug('Failed to transform individual OTLP metric data block:', error);
        }
        return null;
      }
    })
    .filter(Boolean);

  if (otelMetrics.length === 0) return { resourceMetrics: [] };

  // All metrics in the same process share the same resource
  // Extract resource once from the first metric
  const resource = transformers.resource.extractResourceAttributes(metricsArray[0]);
  return {
    resourceMetrics: [
      {
        resource: resource,
        scopeMetrics: [
          {
            scope: SCOPE,
            metrics: otelMetrics
          }
        ]
      }
    ]
  };
}

module.exports = {
  init,
  setHostId,
  setPid,
  convert
};
