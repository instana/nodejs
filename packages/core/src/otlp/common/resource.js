/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const path = require('path');
const ctx = require('./context');

const packageJson = require(path.join(__dirname, '..', '..', '..', 'package.json'));
const SDK_VERSION = packageJson?.version || '1.0.0';

// Todo this might be change in case of serverless
const SCOPE_NAME = '@instana/collector';
const SCOPE_VERSION = SDK_VERSION;

const RESOURCE_DEFAULTS = {
  'service.name': () => ctx.serviceName || 'unknown_service',
  'telemetry.sdk.language': () => 'nodejs',
  'telemetry.sdk.name': () => 'instana',
  'telemetry.sdk.version': () => SDK_VERSION
};

/**
 * Extracts and maps standard OTLP resource attributes
 * @param {Object} rawPayload - The raw inbound telemetry span or metric record
 * @param {Object} [options]
 * @param {boolean} [options.includeInfrastructure=false] - Explicitly pass true for Metrics to include PID/Host
 * @returns {{ attributes: Array<Object> }}
 */
function extractResourceAttributes(rawPayload, options = {}) {
  if (!rawPayload) {
    return { attributes: [] };
  }

  // @ts-ignore
  const spanData = rawPayload.data || {};
  const embeddedResource = spanData.resource || rawPayload.resource || {};
  const attributes = [];

  // 1. Process base declarative configurations loop (Shared by both Traces & Metrics)
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

  // 2. ONLY attach runtime environment details if explicitly requested (Metrics path)
  if (options.includeInfrastructure === true) {
    // @ts-ignore
    const instanaFrom = rawPayload.from || rawPayload.f || null;
    const finalPid = instanaFrom?.e || ctx.pid;
    const finalHost = instanaFrom?.h || ctx.hostId;

    if (finalPid) {
      attributes.push({
        key: 'process.pid',
        value: { intValue: parseInt(finalPid, 10) }
      });
    }

    if (finalHost) {
      attributes.push({
        key: 'host.name',
        value: { stringValue: String(finalHost) }
      });
    }
  }

  return { attributes };
}

/**
 * @param {{ h: any; e: any; }} instanaFrom
 */
function getResourceKey(instanaFrom) {
  if (!instanaFrom) return 'h:empty|e:empty';
  return `h:${instanaFrom.h || 'empty'}|e:${instanaFrom.e || 'empty'}`;
}

module.exports = {
  extractResourceAttributes,
  getResourceKey,
  SCOPE_NAME,
  SCOPE_VERSION
};
