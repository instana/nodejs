/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

/**
 * OTLP attribute mappings for different span types.
 * Maps Instana span data fields to OTLP semantic convention attributes.
 *
 * Based on OpenTelemetry Semantic Conventions for HTTP:
 * - Common HTTP exit (client) span mapping
 * - Common HTTP entry (server) span mapping
 *
 * @type {Object<string, Object<string, string>>}
 */
const otlpAttributeMappings = {
  http: {
    // HTTP method mapping (both client and server)
    // Instana: http.method -> OTel: http.request.method
    method: 'http.request.method',

    // HTTP status code mapping (both client and server)
    // Instana: http.status -> OTel: http.response.status_code
    status: 'http.response.status_code',

    // HTTP URL mapping (client spans)
    // Instana: http.url -> OTel: url.full
    url: 'url.full',

    // HTTP path mapping (server spans)
    // Instana: http.path -> OTel: url.path
    path: 'url.path',

    // HTTP host mapping (both client and server)
    // Instana: http.host -> OTel: server.address (simplified, may need port handling)
    host: 'server.address',

    // HTTP protocol mapping
    // Instana: http.protocol -> OTel: network.protocol.name (may need version split)
    protocol: 'network.protocol.name',

    // HTTP query parameters mapping (both client and server)
    // Instana: http.params -> OTel: url.query
    params: 'url.query',

    // HTTP path template mapping (both client and server)
    // Instana: http.path_tpl -> OTel: url.template
    path_tpl: 'url.template',

    // HTTP error mapping (both client and server)
    // Instana: http.error -> OTel: error.type
    error: 'error.type',

    // Note: http.context_root mapping is not included as it conflicts with http.path
    // Both would map to url.path. Context root extraction requires special logic
    // and should be implemented separately when needed.

    // Legacy mappings for backward compatibility
    status_text: 'http.status_text',

    // HTTP route mapping (alternative to path_tpl)
    route: 'http.route'
  },

  // resource but added for ui view, without this .. ?
  service: {
    name: 'service.name'
  }
};

/**
 * Transforms span data fields to OTLP attribute naming while keeping
 * the mapper logic separate from the backend field mapping.
 *
 * @param {import('../../core').InstanaBaseSpan} span
 * @returns {import('../../core').InstanaBaseSpan} The transformed span.
 */
module.exports.transform = span => {
  if (!span || !span.data) {
    return span;
  }

  Object.keys(span.data).forEach(key => {
    const mappings = otlpAttributeMappings[key];
    if (!mappings || typeof span.data[key] !== 'object' || span.data[key] === null) {
      return;
    }

    applyMappings(span.data[key], mappings, key);
  });

  return span;
};

/**
 * Applies OTLP field mappings to a specific data section.
 *
 * @param {Record<string, any>} dataSection
 * @param {Object<string, string>} mappings
 * @param {string} sectionKey
 */
function applyMappings(dataSection, mappings, sectionKey) {
  Object.keys(dataSection).forEach(internalField => {
    const mappedField = mappings[internalField] || `${sectionKey}.${internalField}`;
    dataSection[mappedField] = dataSection[internalField];
    delete dataSection[internalField];
  });
}

module.exports.getOtlpAttributeMappings = function () {
  return otlpAttributeMappings;
};
