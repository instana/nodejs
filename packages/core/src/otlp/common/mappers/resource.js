/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const path = require('path');
const ctx = require('../context');

const packageJson = require(path.join(__dirname, '..', '..', '..', '..', 'package.json'));
const SDK_VERSION = packageJson?.version || '1.0.0';

/**
 * Get resource defaults with current semconv keys
 * @returns {Object}
 */
function getResourceDefaults() {
  const attrs = ctx.semConv.resource;
  return {
    [attrs.SERVICE_NAME]: () => ctx._serviceName || null,
    [attrs.SDK_LANGUAGE]: () => 'nodejs',
    [attrs.SDK_NAME]: () => 'instana',
    [attrs.SDK_VERSION]: () => SDK_VERSION
  };
}

/**
 * Maps resource attributes using semantic convention version
 *
 * @param {Object} rawPayload - Individual metric element block or trace record
 * @param {Object} [options]
 * @param {boolean} [options.includeInfrastructure=false] - Explicitly pass true for Metrics to include PID/Host
 * @param {string|number} [options.fallbackPid]
 * @returns {Array<Object>} Array of OTLP attribute objects
 */
function mapResourceAttributes(rawPayload, options = {}) {
  if (!rawPayload) {
    return [];
  }

  const includeInfra = options.includeInfrastructure === true;
  const instanaFrom = rawPayload.from || rawPayload.f || rawPayload.data?.resource || null;
  const spanData = rawPayload.data || {};
  const embeddedResource = spanData.resource || rawPayload.resource || {};
  const attributes = [];

  // Process service identity and SDK defaults
  const resourceDefaults = getResourceDefaults();
  const keys = Object.keys(resourceDefaults);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    // @ts-ignore
    const value = embeddedResource[key] !== undefined ? embeddedResource[key] : resourceDefaults[key]();

    if (value !== null && value !== undefined) {
      attributes.push({
        key,
        value: { stringValue: String(value) }
      });
    }
  }

  // Process infrastructure metadata
  if (includeInfra) {
    const attrs = ctx.semConv.resource;
    const finalPid = instanaFrom?.e || options.fallbackPid || ctx.pid;
    const finalHost = instanaFrom?.h || ctx.hostId;

    if (finalPid) {
      attributes.push({
        key: attrs.PROCESS_PID,
        value: { intValue: parseInt(finalPid, 10) }
      });
    }

    if (finalHost) {
      attributes.push({
        key: attrs.HOST_NAME,
        value: { stringValue: String(finalHost) }
      });
    }
  }

  return attributes;
}

module.exports = {
  mapResourceAttributes
};
