/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const otlpCtx = require('../common/context');
const { normalizeMetrics } = require('./util');
const transformers = require('./transformers');

const { INSTRUMENTATION_SCOPE } = transformers.resource;

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

  resolveServiceName(metrics);

  const resource = transformers.resource.extractResourceAttributes(metricsArray[0]);

  return {
    resourceMetrics: [
      {
        resource,
        scopeMetrics: [
          {
            scope: INSTRUMENTATION_SCOPE,
            metrics: []
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
