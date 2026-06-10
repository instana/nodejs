/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { flattenObject, toOtelMetricData, getResourceKey } = require('./util');

let config;

let cachedHostId = null;
let cachedPid = null;

function init(_config) {
  config = _config;
}

function setHostId(hostId) {
  cachedHostId = hostId;
}

function setPid(pid) {
  cachedPid = String(pid);
}

/**
 * Build OTEL resource attributes
 * todo: We can make the logic generic with span resource attributes later
 */
function createResourceAttributes(from) {
  const attributes = [];

  attributes.push({
    key: 'telemetry.sdk.language',
    value: { stringValue: 'nodejs' }
  });

  attributes.push({
    key: 'telemetry.sdk.name',
    value: { stringValue: '@instana/collector' }
  });

  attributes.push({
    key: 'service.name',
    value: {
      stringValue: config?.serviceName || 'nodejs-service'
    }
  });

  const pid = from?.e || cachedPid;
  const hostId = from?.h || cachedHostId;

  if (pid) {
    attributes.push({
      key: 'process.pid',
      value: { intValue: parseInt(pid, 10) }
    });
  }

  if (hostId) {
    attributes.push({
      key: 'host.name',
      value: { stringValue: hostId }
    });
  }

  return attributes;
}

function normalizeMetrics(instanaMetrics) {
  if (!Array.isArray(instanaMetrics)) {
    if (!instanaMetrics || typeof instanaMetrics !== 'object') {
      return [];
    }

    const { from, ...metricsData } = instanaMetrics;
    const flattened = flattenObject(metricsData);

    return Object.keys(flattened).map(key => ({
      name: key,
      value: flattened[key],
      timestamp: Date.now(),
      unit: '',
      from: from
    }));
  }

  return instanaMetrics;
}

function transform(instanaMetrics) {
  const metricsArray = normalizeMetrics(instanaMetrics);

  if (!metricsArray.length) {
    return { resourceMetrics: [] };
  }

  // group by resource
  const grouped = new Map();

  metricsArray.forEach(metric => {
    const key = getResourceKey(metric.from);

    if (!grouped.has(key)) {
      grouped.set(key, {
        resource: metric.from,
        metrics: []
      });
    }

    grouped.get(key).metrics.push(metric);
  });

  // build OTLP output
  const resourceMetrics = Array.from(grouped.values()).map(group => {
    const metrics = group.metrics.map(metric => ({
      name: metric.name || 'unknown.metric',
      ...toOtelMetricData(metric.value)
    }));

    return {
      resource: {
        attributes: createResourceAttributes(group.resource)
      },
      scopeMetrics: [
        {
          scope: {
            name: '@instana/collector',
            version: '3.0.0'
          },
          metrics
        }
      ]
    };
  });

  return { resourceMetrics };
}

module.exports = {
  init,
  transform,
  setHostId,
  setPid
};
