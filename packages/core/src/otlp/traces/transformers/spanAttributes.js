/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const ctx = require('../../common/context');
const MAPPINGS = require('../mappers/spanAttributes');
const { formatOTLPValue, combineFields } = require('../util');

const RESOURCE_KEY = 'resource';

const SPAN_HANDLERS = {
  otel: extractOtelAttributes
};

/**
 * @param {import('../../../core').InstanaBaseSpan} span
 */
function extractSpanAttributes(span) {
  if (!span?.data) {
    return [];
  }

  // Note: OTEL spans use a different payload structure and do not follow
  // instrumentation-specific attribute mappings.
  const attributeExtractor = SPAN_HANDLERS[span.n];
  if (attributeExtractor) {
    return attributeExtractor(span.data);
  }

  const mappings = getAttributeMappings(MAPPINGS, ctx.semConv);

  const attributes = [];
  const spanTypes = Object.keys(span.data);

  for (let i = 0; i < spanTypes.length; i++) {
    const spanType = spanTypes[i];

    if (spanType === RESOURCE_KEY) {
      continue;
    }

    const mappedAttributes = applyAttributeMapping(mappings, spanType, span.data[spanType]);

    for (let j = 0; j < mappedAttributes.length; j++) {
      attributes.push(mappedAttributes[j]);
    }
  }

  return attributes;
}

/**
 * Extract attributes from otel spans.
 *
 * @param {Object} data
 */
function extractOtelAttributes(data) {
  if (!data) {
    return [];
  }

  const attributes = [];

  // OTel spans may contain metadata outside `tags`.
  // Export `operation` until dedicated semantic mapping is introduced.
  if (data.operation) {
    attributes.push({
      key: 'operation',
      value: formatOTLPValue(data.operation)
    });
  }

  if (!data.tags) {
    return attributes;
  }

  const tagKeys = Object.keys(data.tags);

  for (let i = 0; i < tagKeys.length; i++) {
    const key = tagKeys[i];

    attributes.push({
      key,
      value: formatOTLPValue(data.tags[key])
    });
  }

  return attributes;
}

/**
 * Applies attribute mappings for a specific instrumentation type.
 *
 * @param {Object} mappings
 * @param {string} spanType
 * @param {any} spanData
 */
function applyAttributeMapping(mappings, spanType, spanData) {
  const attributeMappings = mappings?.[spanType];

  if (!Array.isArray(attributeMappings)) {
    return [];
  }

  const attributes = [];

  for (let i = 0; i < attributeMappings.length; i++) {
    const attribute = applyMapping(attributeMappings[i], spanData);

    if (attribute) {
      attributes.push(attribute);
    }
  }

  return attributes;
}

/**
 * Resolves an individual attribute translation rule.
 *
 * @param {Object} mapping
 * @param {any} spanData
 * @returns {Object|null}
 */
function applyMapping(mapping, spanData) {
  if (!mapping) {
    return null;
  }

  let value;

  // Static value mapping.
  if (mapping.value !== undefined && !mapping.instana) {
    value = mapping.value;
  }
  // Multi-field mapping.
  else if (Array.isArray(mapping.instana)) {
    const values = [];

    for (let i = 0; i < mapping.instana.length; i++) {
      values.push(spanData?.[mapping.instana[i]]);
    }

    value = mapping.transform ? mapping.transform(spanData, values) : combineFields(spanData, mapping.instana);
  }
  // Single-field mapping.
  else if (typeof mapping.instana === 'string') {
    const rawValue = spanData?.[mapping.instana];

    if (rawValue === null || rawValue === undefined) {
      return null;
    }

    value = mapping.transform ? mapping.transform(rawValue, spanData) : rawValue;
  } else {
    return null;
  }

  if (value === null || value === undefined) {
    return null;
  }

  return {
    key: mapping.otlp,
    value: formatOTLPValue(value)
  };
}

function getAttributeMappings(mappingsModule, OTLP) {
  const instrumentationMappings = mappingsModule.getInstrumentationMappings(OTLP);

  const attributeMappings = {};
  const types = Object.keys(instrumentationMappings);

  for (let i = 0; i < types.length; i++) {
    const type = types[i];
    const { spanAttributes } = instrumentationMappings[type];

    if (spanAttributes) {
      attributeMappings[type] = spanAttributes;
    }
  }

  return attributeMappings;
}

module.exports = {
  extractSpanAttributes
};
