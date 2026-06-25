/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { formatOTLPValue } = require('./util');
const { OTLP_STATUS_CODES, SPECIAL_SPAN_DATA_TYPES } = require('./constants');

const OTEL_SPAN_NAME = SPECIAL_SPAN_DATA_TYPES.OTEL;

/**
 * @typedef {Object} OtelMapping
 * @property {string} otlp
 * @property {any} [value]
 * @property {(data: any) => any} [transform]
 */

/**
 * @typedef {Object} OtelInstrumentationMapping
 * @property {OtelMapping[]} [spanAttributes]
 */

/** @type {Record<string, OtelInstrumentationMapping>} */
const instrumentationMappings = {
  operation: {
    spanAttributes: [{ otlp: 'operation' }]
  }
};

/**
 * @param {import('../../../core').InstanaBaseSpan} span
 * @returns {boolean}
 */
function isOtelSpan(span) {
  return span.n === OTEL_SPAN_NAME;
}

/**
 * @param {OtelMapping} mapping
 * @param {any} spanData
 */
function applyMapping(mapping, spanData) {
  if (!mapping) {
    return null;
  }

  let value = mapping.value;

  if (value === undefined) {
    if (spanData === null || spanData === undefined) {
      return null;
    }

    value = mapping.transform ? mapping.transform(spanData) : spanData;
  }

  if (value === null || value === undefined) {
    return null;
  }

  return {
    key: mapping.otlp,
    value: formatOTLPValue(value)
  };
}

module.exports = {
  OTEL_SPAN_NAME,
  isOtelSpan,
  /** @param {import('../../../core').InstanaBaseSpan} span */
  spanName(span) {
    return span.n || 'unknown';
  },
  /** @param {import('../../../core').InstanaBaseSpan} span */
  spanAttributes(span) {
    const attributes = [];
    const spanTypes = Object.keys(span.data || {});

    for (let i = 0; i < spanTypes.length; i++) {
      const spanType = spanTypes[i];

      if (spanType === SPECIAL_SPAN_DATA_TYPES.RESOURCE) {
        continue;
      }

      const spanData = span.data[spanType];

      if (spanType === SPECIAL_SPAN_DATA_TYPES.TAGS && spanData) {
        const tagKeys = Object.keys(spanData);

        for (let j = 0; j < tagKeys.length; j++) {
          const key = tagKeys[j];

          attributes.push({
            key,
            value: formatOTLPValue(spanData[key])
          });
        }

        continue;
      }

      const handler = instrumentationMappings[spanType]?.spanAttributes;

      if (!Array.isArray(handler) || spanData === null || spanData === undefined) {
        continue;
      }

      for (let j = 0; j < handler.length; j++) {
        const attribute = applyMapping(handler[j], spanData);

        if (attribute) {
          attributes.push(attribute);
        }
      }
    }

    return attributes;
  },

  /** @param {import('../../../core').InstanaBaseSpan} span */
  spanStatus(span) {
    if (!span?.ec) {
      return { code: OTLP_STATUS_CODES.UNSET };
    }

    return {
      code: OTLP_STATUS_CODES.ERROR,
      message: String(span.data?.tags?.error || `${span?.n || 'operation'} failed`)
    };
  }
};
