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
  const dataBlock = instanaSpan?.data;

  if (!dataBlock) {
    return [];
  }

  // OpenTelemetry bridge spans
  if (instanaSpan.n === 'otel') {
    // key: 'otel.operation' ignored for now
    return Object.entries(dataBlock.tags || {}).map(([key, value]) => ({
      key,
      value: formatOTLPValue(value)
    }));
  }

  return Object.entries(dataBlock)
    .filter(([key]) => key !== 'resource')
    .flatMap(([key, spanData]) => {
      const handler = SPECIAL_HANDLERS[key];
      return handler ? handler(spanData) : applyMappingsForSpanType(key, spanData);
    });
}

/**
 * Peer mapping processor
 */
function applyPeerMappings(peerData) {
  if (!peerData) {
    return [];
  }

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

  if (mapping.value !== undefined && !mapping.instana && !mapping.instanaKeys) {
    value = mapping.value;
  } else if (Array.isArray(mapping.instanaKeys)) {
    value = mapping.transform
      ? mapping.transform(spanData, mapping.instanaKeys)
      : combineFields(spanData, mapping.instanaKeys);
  } else if (mapping.instana) {
    const rawValue = spanData?.[mapping.instana];

    if (rawValue == null) {
      return null;
    }

    value = mapping.transform ? mapping.transform(rawValue) : rawValue;
  } else {
    return null;
  }

  if (value == null) {
    return null;
  }

  return {
    key: mapping.otlp,
    value: formatOTLPValue(value)
  };
}

module.exports = {
  extractSpanDataAttributes
};
