/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const path = require('path');
const ctx = require('../context');
const resource = require('../mappers/resource');

const packageJson = require(path.join(__dirname, '..', '..', '..', '..', 'package.json'));
const SDK_VERSION = packageJson?.version || '1.0.0';

const SCOPE_NAME = '@instana/collector';
const SCOPE_VERSION = SDK_VERSION;

const resourceCache = new Map();

function clearResourceCache() {
  resourceCache.clear();
}

/**
 * Extracts and transforms resource attributes for OTLP format
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

  const attributes = resource.mapResourceAttributes(rawPayload, options);
  const result = { attributes };

  // Save to cache
  resourceCache.set(cacheKey, result);
  return result;
}

module.exports = {
  extractResourceAttributes,
  clearResourceCache,
  SCOPE_NAME,
  SCOPE_VERSION
};
