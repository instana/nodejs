/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const ctx = require('../../common/context');
const MAPPINGS = require('../mappers/spanAttributes');
const { formatOTLPValue, combineFields } = require('../util');

const SPAN_HANDLERS = {
  otel: extractOtelAttributes
};

/**
 * Orchestrates span data attribute extraction.
 */
function extractSpanAttributes(instanaSpan) {
  if (!instanaSpan || !instanaSpan.data) return [];

  // Direct short-circuit route for specialized span handlers (like 'otel')
  const spanHandler = SPAN_HANDLERS[instanaSpan.n];
  if (spanHandler) {
    return spanHandler(instanaSpan.data);
  }

  const attributes = [];
  const dataKeys = Object.keys(instanaSpan.data);

  for (let i = 0; i < dataKeys.length; i++) {
    const key = dataKeys[i];
    if (key === 'resource') continue;

    const mappedAttributes = applyAttributeMapping(key, instanaSpan.data[key]);

    for (let j = 0; j < mappedAttributes.length; j++) {
      attributes.push(mappedAttributes[j]);
    }
  }

  return attributes;
}

/**
 * Extracts raw tags from native Otel instrumentation payloads.
 */
function extractOtelAttributes(data) {
  if (!data || !data.tags) return [];

  const attributes = [];
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
 * Coordinates matching rules for specific span classifications.
 * @param {string} spanType
 * @param {any} spanData
 */
function applyAttributeMapping(spanType, spanData) {
  const activeMappings =
    typeof MAPPINGS.getAttributeMappings === 'function' ? MAPPINGS.getAttributeMappings(ctx.semConv) : MAPPINGS;

  const rules = activeMappings?.[spanType];
  if (!Array.isArray(rules)) return [];

  const result = [];
  for (let i = 0; i < rules.length; i++) {
    const attribute = applyMapping(rules[i], spanData);
    if (attribute) {
      result.push(attribute);
    }
  }

  return result;
}

/**
 * Resolves an individual attribute translation rule configuration.
 */
function applyMapping(mapping, spanData) {
  if (!mapping) return null;
  let value;

  // Case 1: Hardcoded static configurations
  if (mapping.value !== undefined && !mapping.instana) {
    value = mapping.value;
  }
  // Case 2: Multi-field compound mappings
  else if (Array.isArray(mapping.instana)) {
    const values = [];
    for (let i = 0; i < mapping.instana.length; i++) {
      values.push(spanData?.[mapping.instana[i]]);
    }
    value = mapping.transform ? mapping.transform(spanData, values) : combineFields(values);
  }
  // Case 3: Flat single-key extractions
  else if (typeof mapping.instana === 'string') {
    const rawValue = spanData?.[mapping.instana];
    if (rawValue === null || rawValue === undefined) return null;
    value = mapping.transform ? mapping.transform(rawValue, spanData) : rawValue;
  } else {
    return null;
  }

  if (value === null || value === undefined) return null;

  return {
    key: mapping.otlp,
    value: formatOTLPValue(value)
  };
}

module.exports = {
  extractSpanAttributes
};
