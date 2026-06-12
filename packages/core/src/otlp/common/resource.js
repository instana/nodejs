/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const path = require('path');
const ctx = require('./context');
const { RESOURCE_ATTRIBUTES } = require('./constants');

const packageJson = require(path.join(__dirname, '..', '..', '..', 'package.json'));
const SDK_VERSION = packageJson?.version || '1.0.0';

// Todo this might be change in case of serverless
const SCOPE_NAME = '@instana/collector';
const SCOPE_VERSION = SDK_VERSION;

const RESOURCE_DEFAULTS = {
  [RESOURCE_ATTRIBUTES.SERVICE_NAME]: () => ctx._serviceName || null,
  [RESOURCE_ATTRIBUTES.SDK_LANGUAGE]: () => 'nodejs',
  [RESOURCE_ATTRIBUTES.SDK_NAME]: () => 'instana',
  [RESOURCE_ATTRIBUTES.SDK_VERSION]: () => SDK_VERSION
};

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

  const spanData = rawPayload.data || {};
  const embeddedResource = spanData.resource || rawPayload.resource || {};
  const attributes = [];

  // 1. Process service identity and SDK base configurations dynamically
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

  // 2. Attach infrastructure environment details if requested
  if (options.includeInfrastructure === true) {
    const instanaFrom = rawPayload.from || rawPayload.f || null;
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

  return { attributes };
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
  getResourceKey,
  SCOPE_NAME,
  SCOPE_VERSION
};
