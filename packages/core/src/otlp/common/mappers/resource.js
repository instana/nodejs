/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const path = require('path');
const ctx = require('../context');

const packageJson = require(path.join(__dirname, '..', '..', '..', '..', 'package.json'));
const SDK_VERSION = packageJson?.version || '1.0.0';

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
 * Maps resource-level attributes from the span payload.
 *
 * Resource attributes can originate from:
 *   - Embedded OpenTelemetry resource data (`data.resource`)
 *   - SDK defaults (service name, SDK metadata)
 *
 * Infrastructure attributes such as process id and host id are derived
 * from the Instana source metadata (`f`) when requested.
 *
 * @param {import('../types').OtlpResourceSource | null | undefined} rawPayload
 * @param {import('../types').OtlpResourceExtractOptions} [options]
 * @returns {import('../../types/otel-span').OtelAttribute[]}
 */
function mapResourceAttributes(rawPayload, options = {}) {
  if (!rawPayload) {
    return [];
  }

  // Instana source metadata:
  //   e -> process id
  //   h -> host identifier
  const sourceMetadata = rawPayload.f || null;

  // OpenTelemetry resource attributes attached to the span.
  const resourceAttributes = rawPayload.data?.resource || rawPayload.resource || {};

  const attributes = [];

  // Apply embedded resource attributes and SDK defaults.
  const resourceDefaults = getResourceDefaults();
  const resourceKeys = Object.keys(resourceDefaults);

  for (let i = 0; i < resourceKeys.length; i++) {
    const key = resourceKeys[i];

    const value = resourceAttributes[key] !== undefined ? resourceAttributes[key] : resourceDefaults[key]();

    if (value !== null && value !== undefined) {
      attributes.push({
        key,
        value: { stringValue: String(value) }
      });
    }
  }

  const attrs = ctx.semConv.resource;

  const processId = sourceMetadata?.e || options.fallbackPid || ctx.pid;

  const hostName = sourceMetadata?.h || ctx.hostId;

  if (processId) {
    attributes.push({
      key: attrs.PROCESS_PID,
      value: { intValue: parseInt(String(processId), 10) }
    });
  }

  if (hostName) {
    attributes.push({
      key: attrs.HOST_NAME,
      value: { stringValue: String(hostName) }
    });
  }

  return attributes;
}

module.exports = {
  mapResourceAttributes
};
