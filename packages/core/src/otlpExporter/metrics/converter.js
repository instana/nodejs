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
function resolveServiceIdentity(metrics) {
  if (metrics?.name && typeof metrics.name === 'string' && !otlpCtx.serviceName) {
    otlpCtx.setServiceName(metrics.name);
  }
  if (metrics?.version && typeof metrics.version === 'string' && !otlpCtx.serviceVersion) {
    otlpCtx.setServiceVersion(metrics.version);
  }
}

/**
 * @param {any} metrics
 * @returns {Object}
 */
function convert(metrics) {
  try {
    const metricsArray = normalizeMetrics(metrics);

    if (metricsArray.length === 0) {
      return { resourceMetrics: [] };
    }

    // Service identity(name + version) resolution, it not come from first metric once it set it
    // will be used for all metrics
    resolveServiceIdentity(metrics);

    // All metrics share the same resource, so we can extract the attributes from the first one
    const resource = transformers.resource.extractResourceAttributes(/** @type {any} */ (metricsArray[0]));

    return {
      resourceMetrics: [
        {
          resource,
          scopeMetrics: [
            {
              scope: INSTRUMENTATION_SCOPE,
              // TODO: implement metrics transformation later in phase2
              metrics: []
            }
          ]
        }
      ]
    };
  } catch (error) {
    logger?.debug('Failed to convert metrics to OTLP format.', error);
    return { resourceMetrics: [] };
  }
}

module.exports = {
  init,
  convert
};
