/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { extractSpanMetadata, extractResourceAttributes, extractSpanAttributes } = require('./transformers');
const { isLogSpan } = require('./util');
const { INSTRUMENTATION_SCOPE_NAME } = require('./constants');

/** @type {import('../../../core').GenericLogger} */
let logger;

const SCOPE = {
  name: INSTRUMENTATION_SCOPE_NAME,
  version: '3.0.0'
};

/**
 * @param {Object} config - Configuration object
 */
exports.init = function init(config) {
  logger = config.logger;
};

/**
 * Converts Instana spans to OTLP ResourceSpans format.
 * @param {any[]} spans
 * @returns {{resourceSpans: any[]}}
 */
exports.convert = function convert(spans) {
  if (!Array.isArray(spans) || spans.length === 0) {
    return { resourceSpans: [] };
  }

  const convertedSpans = spans.reduce((result, span) => {
    if (!span) {
      return result;
    }

    if (isLogSpan(span)) {
      // logSignalExporter(span);
      return result;
    }

    const mappedSpan = mapSpanToOTLP(span);
    if (mappedSpan) {
      result.push(mappedSpan);
    }

    return result;
  }, []);

  return {
    resourceSpans: buildResourceSpans(groupSpansByResource(convertedSpans))
  };
};
/**
 * Converts a single Instana span to OTLP format.
 *
 * @param {any} span
 * @returns {any|null}
 */
function mapSpanToOTLP(span) {
  try {
    return {
      ...extractSpanMetadata(span),
      attributes: extractSpanAttributes(span),
      resource: {
        attributes: extractResourceAttributes(span)
      }
    };
  } catch (error) {
    if (logger) {
      logger.debug(`Failed to convert span to OTLP format: ${error.message}`, {
        spanId: span?.s,
        traceId: span?.t,
        spanName: span?.n
      });
    }
    return null;
  }
}

/**
 * Groups spans by resource attributes.
 *
 * @param {any[]} spans
 * @returns {Map<string, {resource: any, spans: any[]}>}
 */
function groupSpansByResource(spans) {
  return spans.reduce((groups, span) => {
    const resourceKey = JSON.stringify(span.resource.attributes);

    if (!groups.has(resourceKey)) {
      groups.set(resourceKey, {
        resource: span.resource,
        spans: []
      });
    }

    const { resource, ...spanWithoutResource } = span;

    groups.get(resourceKey).spans.push(spanWithoutResource);

    return groups;
  }, new Map());
}

/**
 * Builds OTLP ResourceSpans payload.
 *
 * @param {Map<string, {resource: any, spans: any[]}>} groups
 * @returns {any[]}
 */
function buildResourceSpans(groups) {
  return Array.from(groups.values()).map(group => ({
    resource: group.resource,
    scopeSpans: [
      {
        scope: SCOPE,
        spans: group.spans
      }
    ]
  }));
}
