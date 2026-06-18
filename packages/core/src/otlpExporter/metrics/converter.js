/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const otlpCtx = require('../common/context');
const { normalizeMetrics } = require('./util');
const transformers = require('./transformers');

const { INSTRUMENTATION_SCOPE } = transformers.resource;

/** @type {import('@instana/core/src/core').GenericLogger} */
let logger;

/**
 * @param {import('../../config').InstanaConfig} config
 */
function init(config) {
  logger = config?.logger;
}

/**
 * @param {any} metrics
 */
function resolveServiceName(metrics) {
  if (metrics?.name && typeof metrics.name === 'string' && !otlpCtx.serviceName) {
    otlpCtx.setServiceName(metrics.name);
  }
}

/**
 * @param {any} metrics
 * @returns {Object}
 */
function convert(metrics) {
  const metricsArray = normalizeMetrics(metrics);

  if (metricsArray.length === 0) {
    return { resourceMetrics: [] };
  }

  // Service name resolution, it not come from first metric once it set it will be used for all metrics
  resolveServiceName(metrics);

  // All metrics share the same resource, so we can extract the attributes from the first one
  const resource = transformers.resource.extractResourceAttributes(metricsArray[0]);

  return {
    resourceMetrics: [
      {
        resource,
        scopeMetrics: [
          {
            scope: INSTRUMENTATION_SCOPE,
            // TODO: implement metrics transformation later
            metrics: []
          }
        ]
      }
    ]
  };
}

module.exports = {
  init,
  convert
};
