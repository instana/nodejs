/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const path = require('path');
const packageJson = require(path.join(__dirname, '..', '..', '..', '..', 'package.json'));

const { flattenObject, toOtelMetricData } = require('./util');
const resourceUtil = require('./resource');
const packageVersion = packageJson?.version;

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

  const grouped = new Map();

  metricsArray.forEach(metric => {
    // use the centralized resource key logic
    const key = resourceUtil.getResourceKey(metric.from, cachedHostId, cachedPid);

    if (!grouped.has(key)) {
      grouped.set(key, {
        resourceContext: metric.from,
        metrics: []
      });
    }

    grouped.get(key).metrics.push(metric);
  });

  const resourceMetrics = Array.from(grouped.values()).map(group => {
    const metrics = group.metrics.map(metric => ({
      name: metric.name || 'unknown.metric',
      ...toOtelMetricData(metric.value)
    }));

    // build the centralized attributes context
    const attributeContext = {
      config,
      packageVersion,
      hostId: cachedHostId,
      pid: cachedPid,
      fromContextHostId: group.resourceContext?.h,
      fromContextPid: group.resourceContext?.e
    };

    return {
      resource: {
        // use the centralized attribute creation
        attributes: resourceUtil.createStandardAttributes(attributeContext)
      },
      scopeMetrics: [
        {
          scope: {
            name: '@instana/collector',
            version: packageVersion
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
