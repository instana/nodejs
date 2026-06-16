/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const path = require('path');
const ctx = require('../context');
const resource = require('../mappers/resource');

const packageJson = require(path.join(__dirname, '..', '..', '..', '..', 'package.json'));
const SDK_VERSION = packageJson?.version || '1.0.0';

// TODO: we need to correct the packagename later
// in case of serverless collectors the value will be different
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
 * @param {string|number} [options.fallbackPid]
 * @returns {{ attributes: Array<Object> }}
 */

function extractResourceAttributes(rawPayload, options = {}) {
  if (!rawPayload) {
    return { attributes: [] };
  }

  // Instana source metadata:
  //   e -> process id
  //   h -> host identifier
  const sourceMetadata = rawPayload.f || null;

  // Cache resources by service identity and infrastructure metadata.
  const cacheKey = [
    ctx.serviceName || 'unknown_service',
    `host:${sourceMetadata?.h || 'none'}`,
    `pid:${sourceMetadata?.e || options.fallbackPid || 'none'}`
  ].join('|');

  const cached = resourceCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const result = {
    attributes: resource.mapResourceAttributes(rawPayload, options)
  };

  resourceCache.set(cacheKey, result);

  return result;
}
module.exports = {
  extractResourceAttributes,
  clearResourceCache,
  SCOPE_NAME,
  SCOPE_VERSION
};
