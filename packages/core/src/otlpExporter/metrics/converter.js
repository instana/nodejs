/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const otlpCtx = require('../common/context');
const transformers = require('./transformers');
const mappers = require('./mappers');

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
  try {
    if (!metrics || typeof metrics !== 'object' || (Array.isArray(metrics) && metrics.length === 0)) {
      return { resourceMetrics: [] };
    }

    // Service name resolution, it not come from first metric once it set it will be used for all metrics
    resolveServiceName(metrics);

    const resource = transformers.resource.extractResourceAttributes(/** @type {any} */ (metrics));

    return {
      resourceMetrics: [
        {
          resource,
          scopeMetrics: [
            {
              scope: INSTRUMENTATION_SCOPE,
              metrics: transformers.extractMetrics(metrics, mappers.allMappings)
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
