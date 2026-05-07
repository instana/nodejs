/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

/**
 * OTLP attribute mappings for different span types.
 * Maps Instana span data fields to OTLP semantic convention attributes.
 *
 * @type {Object<string, Object<string, string>>}
 */
const otlpAttributeMappings = {
  http: {
    method: 'http.method',
    url: 'http.target',
    path_tpl: 'http.route',
    path: 'http.route',
    status: 'http.status_code',
    host: 'http.host',
    status_text: 'http.status_text',
    error: 'http.error'
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
