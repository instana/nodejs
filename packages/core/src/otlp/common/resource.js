/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const path = require('path');
const ctx = require('./context');
const { RESOURCE_ATTRIBUTES } = require('./constants');

const packageJson = require(path.join(__dirname, '..', '..', '..', 'package.json'));
const SDK_VERSION = packageJson?.version || '1.0.0';

const SCOPE_NAME = '@instana/collector';
const SCOPE_VERSION = SDK_VERSION;

const RESOURCE_DEFAULTS = {
  [RESOURCE_ATTRIBUTES.SERVICE_NAME]: () => ctx._serviceName || null,
  [RESOURCE_ATTRIBUTES.SDK_LANGUAGE]: () => 'nodejs',
  [RESOURCE_ATTRIBUTES.SDK_NAME]: () => 'instana',
  [RESOURCE_ATTRIBUTES.SDK_VERSION]: () => SDK_VERSION
};

const resourceCache = new Map();

function clearResourceCache() {
  resourceCache.clear();
}

/**
 * Extracts and maps standard OTLP resource attributes
 *
 * @param {Object} rawPayload - Individual metric element block or trace record
 * @param {Object} [options]
 * @param {boolean} [options.includeInfrastructure=false] - Explicitly pass true for Metrics to include PID/Host
 * @param {string|number} [options.fallbackPid]
 * @returns {{ attributes: Array<Object> }}
 */
function extractResourceAttributes(rawPayload, options = {}) {
  if (!rawPayload) {
    return { attributes: [] };
  }

  const includeInfra = options.includeInfrastructure === true;
  const instanaFrom = rawPayload.from || rawPayload.f || rawPayload.data?.resource || null;

  // Create a unique cache identity key combining service name state, infrastructure preference, and endpoint details
  const cacheKey = `${ctx._serviceName || 'no_svc'}|infra:${includeInfra}|h:${instanaFrom?.h || 'empty'}|e:${
    instanaFrom?.e || 'empty'
  }`;

  if (resourceCache.has(cacheKey)) {
    return resourceCache.get(cacheKey);
  }

  const spanData = rawPayload.data || {};
  const embeddedResource = spanData.resource || rawPayload.resource || {};
  const attributes = [];

  // 2. Process service identity and SDK defaults
  const keys = Object.keys(RESOURCE_DEFAULTS);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    // @ts-ignore
    const value = embeddedResource[key] !== undefined ? embeddedResource[key] : RESOURCE_DEFAULTS[key]();

    if (value !== null && value !== undefined) {
      attributes.push({
        key,
        value: { stringValue: String(value) }
      });
    }
  }

  // 3. Process infrastructure metadata
  if (includeInfra) {
    const finalPid = instanaFrom?.e || options.fallbackPid || ctx.pid;
    const finalHost = instanaFrom?.h || ctx.hostId;

    if (finalPid) {
      attributes.push({
        key: RESOURCE_ATTRIBUTES.PROCESS_PID,
        value: { intValue: parseInt(finalPid, 10) }
      });
    }

    if (finalHost) {
      attributes.push({
        key: RESOURCE_ATTRIBUTES.HOST_NAME,
        value: { stringValue: String(finalHost) }
      });
    }
  }

  const result = { attributes };

  // 4. Save to cache
  resourceCache.set(cacheKey, result);
  return result;
}

/**
 * @param {{ h: any; e: any; }} instanaFrom
 * @returns {string}
 */
function getResourceKey(instanaFrom) {
  if (!instanaFrom) {
    return 'h:empty|e:empty';
  }
  return `h:${instanaFrom.h || 'empty'}|e:${instanaFrom.e || 'empty'}`;
}

module.exports = {
  extractResourceAttributes,
  clearResourceCache,
  getResourceKey,
  SCOPE_NAME,
  SCOPE_VERSION
};
