/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { formatOTLPValue } = require('./util');
const { STATUS_CODES, SPECIAL_SPAN_TYPES } = require('./constants');

const OTEL_SPAN_NAME = SPECIAL_SPAN_TYPES.OTEL;

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
  return span?.n === OTEL_SPAN_NAME;
}

/**
 * @param {Object} mapping
 * @param {Object} spanData
 * @returns {Object|null}
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
    return span?.n || 'unknown';
  },
  /** @param {import('../../../core').InstanaBaseSpan} span */
  spanAttributes(span) {
    const attributes = [];
    const spanTypes = Object.keys(span.data || {});

    for (let i = 0; i < spanTypes.length; i++) {
      const spanType = spanTypes[i];

      if (spanType === SPECIAL_SPAN_TYPES.RESOURCE) {
        continue;
      }

      const spanData = span.data[spanType];

      if (spanType === SPECIAL_SPAN_TYPES.TAGS && spanData) {
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
      return { code: STATUS_CODES.UNSET };
    }

    return {
      code: STATUS_CODES.ERROR,
      message: String(span.data?.tags?.error || `${span?.n || 'operation'} failed`)
    };
  }
};
