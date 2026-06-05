/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

/**
 * Resource Attributes Transformer
 *
 * This module handles the extraction and transformation of resource attributes
 * for OTLP format. Resource attributes describe the entity producing telemetry
 * data (e.g., service name, SDK information).
 */

/**
 * Creates resource attributes for OTLP format
 * @param {Object} instanaSpan - The Instana span object
 * @returns {Array} Array of OTLP resource attributes
 */
// TODO: get the data dynamically from package.json
function extractResourceAttributes(instanaSpan) {
  const attributes = [];

  // TODO: instead of unknown service, use config.service-name ?
  const serviceName = instanaSpan.data?.service || 'b-test-sample-nodejs-app';

  attributes.push({
    key: 'service.name',
    value: { stringValue: serviceName }
  });

  // SDK information
  attributes.push(
    {
      key: 'telemetry.sdk.language',
      value: { stringValue: 'nodejs' }
    },
    {
      key: 'telemetry.sdk.name',
      value: { stringValue: '@instana/collector' }
    },
    {
      key: 'telemetry.sdk.version',
      value: { stringValue: '3.0.0' }
    }
  );

  return attributes;
}

module.exports = {
  extractResourceAttributes
};

// Made with Bob
