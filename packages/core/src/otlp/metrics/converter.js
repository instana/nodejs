/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const otlpCtx = require('../common/context');
const { normalizeMetrics } = require('./util');
const transformers = require('./transformers');
const resource = require('../common/transformers/resource');

const SCOPE = {
  name: resource.SCOPE_NAME,
  version: resource.SCOPE_VERSION
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
 * Converts a batch of Instana metrics to OTLP ResourceMetrics format.
 * TODO: This conversion is incomplete, its only for the design
 * for now memory is only converterd to OTLP, all other metrics skipped
 */
function convert(metrics) {
  const metricsArray = normalizeMetrics(metrics);
  if (metricsArray.length === 0) return { resourceMetrics: [] };

  // If a new dynamic service name is uncovered from the package payload,
  // setServiceName will internally bust the resource cache safely.
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

  return {
    resourceMetrics: [
      {
        resource: resource.extractResourceAttributes(metricsArray[0], {
          includeInfrastructure: true,
          fallbackPid: metrics?.pid
        }),
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
