/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const MAPPINGS = require('../mappers/dataAttributes');
const { formatOTLPValue, combineFields } = require('../util');

/**
 * Special handlers
 */
const SPECIAL_HANDLERS = {
  peer: applyPeerMappings
};

/**
 * Entry point: extract OTLP attributes from Instana span
 */
function extractSpanDataAttributes(instanaSpan) {
  if (!instanaSpan?.data) {
    return [];
  }

  return Object.entries(instanaSpan.data).flatMap(([key, spanData]) => {
    const handler = SPECIAL_HANDLERS[key];

    if (handler) {
      return handler(spanData);
    }

    return applyMappingsForSpanType(key, spanData);
  });
}

/**
 * Peer mapping (resource/network metadata)
 */
function applyPeerMappings(peerData) {
  if (!peerData) {
    return [];
  }

  const result = [];

  if (peerData.hostname != null) {
    result.push({
      key: 'peer.hostname',
      value: formatOTLPValue(peerData.hostname)
    });
  }

  if (peerData.port != null) {
    result.push({
      key: 'peer.port',
      value: formatOTLPValue(peerData.port)
    });
  }

  return result;
}

/**
 * Apply all mappings for a given span type
 */
function applyMappingsForSpanType(spanType, spanData) {
  const mappings = MAPPINGS?.[spanType];

  if (!Array.isArray(mappings)) {
    return [];
  }

  return mappings.map(mapping => applyMapping(mapping, spanData)).filter(Boolean);
}

/**
 * Apply a single mapping rule
 */
function applyMapping(mapping, spanData) {
  let value;

  // Case 1: static value
  if (mapping.value !== undefined && !mapping.instana && !mapping.instanaKeys) {
    value = mapping.value;
  }

  // Case 2: multi-field mapping
  else if (Array.isArray(mapping.instanaKeys)) {
    value = mapping.transform
      ? mapping.transform(spanData, mapping.instanaKeys)
      : combineFields(spanData, mapping.instanaKeys);
  }

  // Case 3: single field mapping
  else if (mapping.instana) {
    const rawValue = spanData[mapping.instana];

    if (rawValue == null) return null;

    value = mapping.transform ? mapping.transform(rawValue) : rawValue;
  } else {
    return null;
  }

  if (value == null) return null;

  return {
    key: mapping.otlp,
    value: formatOTLPValue(value)
  };
}

module.exports = {
  extractSpanDataAttributes
};
