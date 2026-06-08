/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const config = require('../../../../config');

/**
 * Resource attributes definition (declarative)
 */
const RESOURCE_ATTRIBUTES = [
  {
    key: 'service.name',
    // config not available here, we need to properly get it here
    resolve: instanaSpan => config.serviceName || instanaSpan?.data?.service || 'nodejs-service'
  },
  {
    key: 'telemetry.sdk.language',
    value: 'nodejs'
  },
  {
    key: 'telemetry.sdk.name',
    value: '@instana/collector'
  },
  {
    key: 'telemetry.sdk.version',
    value: '3.0.0'
  }
];

/**
 * Extract OTLP resource attributes
 */
function extractResourceAttributes(instanaSpan) {
  if (!instanaSpan) {
    return [];
  }

  return RESOURCE_ATTRIBUTES.map(attr => {
    const value = attr.resolve ? attr.resolve(instanaSpan) : attr.value;

    if (value == null) {
      return null;
    }

    return {
      key: attr.key,
      value: {
        stringValue: String(value)
      }
    };
  }).filter(Boolean);
}

module.exports = {
  extractResourceAttributes
};
