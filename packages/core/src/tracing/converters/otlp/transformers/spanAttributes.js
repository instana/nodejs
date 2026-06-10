/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const MAPPINGS = require('../mappers/spanAttributes');
const { formatOTLPValue, combineFields } = require('../util');

/**
 * Special span handlers
 */
const SPAN_HANDLERS = {
  otel: extractOtelAttributes
};

/**
 * Special data block handlers
 */
const DATA_HANDLERS = {
  peer: applyPeerMappings
};

/**
 * Entry point: extract OTLP attributes from Instana span
 */
function extractSpanAttributes(instanaSpan) {
  if (!instanaSpan?.data) {
    return [];
  }

  const spanHandler = SPAN_HANDLERS[instanaSpan.n];

  if (spanHandler) {
    return spanHandler(instanaSpan.data);
  }

  return Object.entries(instanaSpan.data)
    .filter(([key]) => key !== 'resource')
    .flatMap(([key, spanData]) => {
      const handler = DATA_HANDLERS[key];
      return handler ? handler(spanData) : applyAttributeMapping(key, spanData);
    });
}

function extractOtelAttributes(data) {
  // key: 'otel.operation' ignored for now
  return Object.entries(data?.tags || {}).map(([key, value]) => ({
    key,
    value: formatOTLPValue(value)
  }));
}

/**
 * Peer mapping
 */
function applyPeerMappings(peerData) {
  if (!peerData) return [];

  return [
    peerData.hostname != null && {
      key: 'peer.hostname',
      value: formatOTLPValue(peerData.hostname)
    },
    peerData.port != null && {
      key: 'peer.port',
      value: formatOTLPValue(peerData.port)
    }
  ].filter(Boolean);
}

/**
 * Apply all mappings for a given span type
 */
function applyAttributeMapping(spanType, spanData) {
  const mappings = MAPPINGS?.[spanType];

  if (!Array.isArray(mappings)) return [];

  return mappings.map(mapping => applyMapping(mapping, spanData)).filter(Boolean);
}

/**
 * Apply a single mapping rule
 */
function applyMapping(mapping, spanData) {
  let value;

  // 1. Static value
  if (mapping.value !== undefined && !mapping.instana) {
    value = mapping.value;
  }

  // 2. Multi-field mapping (ARRAY)
  else if (Array.isArray(mapping.instana)) {
    const values = mapping.instana.map(k => spanData?.[k]);

    value = mapping.transform ? mapping.transform(spanData, values) : combineFields(values);
  }

  // 3. Single-field mapping
  else if (typeof mapping.instana === 'string') {
    const rawValue = spanData?.[mapping.instana];

    if (rawValue == null) return null;

    value = mapping.transform ? mapping.transform(rawValue, spanData) : rawValue;
  }

  // 4. Invalid mapping
  else {
    return null;
  }

  if (value == null) return null;

  return {
    key: mapping.otlp,
    value: formatOTLPValue(value)
  };
}

module.exports = {
  extractSpanAttributes
};
