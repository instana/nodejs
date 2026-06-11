/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

// defined internal keys to avoid dependencies on @opentelemetry/semantic-conventions
const RESOURCE_KEYS = {
  SDK_LANGUAGE: 'telemetry.sdk.language',
  SDK_NAME: 'telemetry.sdk.name',
  SDK_VERSION: 'telemetry.sdk.version',
  SERVICE_NAME: 'service.name',
  PROCESS_PID: 'process.pid',
  HOST_NAME: 'host.name'
};

/**
 * Creates standard resource attributes.
 *
 * @param {Object} context - Combined context (config, cached hostId, pid, packageVersion)
 * @returns {Array<Object>} OTLP formatted attributes
 */
function createStandardAttributes(context) {
  const { config, packageVersion, hostId, pid } = context;

  const attributes = [
    {
      key: RESOURCE_KEYS.SDK_LANGUAGE,
      value: { stringValue: 'nodejs' }
    },
    {
      key: RESOURCE_KEYS.SDK_NAME,
      value: { stringValue: 'instana' }
    },
    {
      key: RESOURCE_KEYS.SERVICE_NAME,
      value: { stringValue: config?.serviceName || 'unknown_service' }
    }
  ];

  if (packageVersion) {
    attributes.push({
      key: RESOURCE_KEYS.SDK_VERSION,
      value: { stringValue: packageVersion }
    });
  }

  // resolve process PID
  const resolvedPid = context.fromContextPid || pid;
  if (resolvedPid) {
    attributes.push({
      key: RESOURCE_KEYS.PROCESS_PID,
      value: { intValue: parseInt(resolvedPid, 10) }
    });
  }

  // resolve host name/ID
  const resolvedHostId = context.fromContextHostId || hostId;
  if (resolvedHostId) {
    attributes.push({
      key: RESOURCE_KEYS.HOST_NAME,
      value: { stringValue: resolvedHostId }
    });
  }

  return attributes;
}

/**
 * Generates a consistent key for grouping/caching resources.
 *
 * @param {Object} fromContext - e.g., the 'from' field from instana metrics
 * @param {string} cachedHostId
 * @param {string} cachedPid
 * @returns {string}
 */
function getResourceKey(fromContext, cachedHostId, cachedPid) {
  const pid = fromContext?.e || cachedPid || '';
  const hostId = fromContext?.h || cachedHostId || '';
  return `h:${hostId}|p:${pid}`;
}

module.exports = {
  RESOURCE_KEYS,
  createStandardAttributes,
  getResourceKey
};
