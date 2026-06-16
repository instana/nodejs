/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const otlpCtx = require('../common/context');
const { normalizeMetrics } = require('./util');
const transformers = require('./transformers');
const { INSTRUMENTATION_SCOPE } = require('../common/mappers/resource');

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

function resolveServiceName(metrics) {
  if (metrics?.name && typeof metrics.name === 'string' && !otlpCtx.serviceName) {
    otlpCtx.setServiceName(metrics.name);
  }
}

// This is not really required in phase 1 implemetation
// function transformMetrics(metricsArray) {
//   return metricsArray
//     .map(rawMetric => {
//       try {
//         return transformers.metricData.extractMetricData(rawMetric);
//       } catch (error) {
//         logger?.debug?.('Failed to transform individual OTLP metric data block:', error);
//         return null;
//       }
//     })
//     .filter(Boolean);
// }

/**
 * TODO:
 * This conversion is currently a prototype implementation.
 */
function convert(metrics) {
  const metricsArray = normalizeMetrics(metrics);

  if (metricsArray.length === 0) {
    return { resourceMetrics: [] };
  }

  resolveServiceName(metrics);

  // Todo: currently return empty metrics
  const otelMetrics = [];
  //   const otelMetrics = transformMetrics(metricsArray);

  const resource = transformers.resource.extractResourceAttributes(metricsArray[0]);

  return {
    resourceMetrics: [
      {
        resource,
        scopeMetrics: [
          {
            scope: INSTRUMENTATION_SCOPE,

            // TODO:
            // Emit transformed metrics once backend support and
            // OTLP metric mapping are fully implemented.
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
