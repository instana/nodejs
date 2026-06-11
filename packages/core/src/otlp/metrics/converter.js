/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const otlpCtx = require('../common/context');
const { normalizeMetrics } = require('./util');
const transformers = require('./transformers');
const resourceFactory = require('../common/resource');

const SCOPE = {
  name: resourceFactory.SCOPE_NAME,
  version: resourceFactory.SCOPE_VERSION
};

let logger;

function init(config) {
  logger = config?.logger;
}

function setHostId(hostId) {
  otlpCtx.setHostId(hostId);
}

function setPid(pid) {
  otlpCtx.setPid(pid);
}

/**
 * Converts a batch of Instana metrics to OTLP ResourceMetrics format.
 */
function convert(instanaMetrics) {
  const metricsArray = normalizeMetrics(instanaMetrics);
  if (metricsArray.length === 0) return { resourceMetrics: [] };

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
        resource: resourceFactory.extractResourceAttributes(metricsArray[0], {
          includeInfrastructure: true
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
