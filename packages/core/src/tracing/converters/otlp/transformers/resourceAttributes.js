/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const config = require('../../../../config');

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

  // Use config.serviceName with fallback to span data or default
  const serviceName = config.serviceName || instanaSpan.data?.service || 'nodejs-service';

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
