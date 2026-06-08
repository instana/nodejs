/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { extractMetaDataAttributes, extractResourceAttributes, extractSpanDataAttributes } = require('./transformers');

const SCOPE = {
  name: '@instana/collector',
  version: '3.0.0'
};

/**
 * Converts Instana spans to OTLP ResourceSpans format.
 *
 * @param {any[]} spans
 * @returns {{resourceSpans: any[]}}
 */
exports.convert = function convert(spans) {
  if (!Array.isArray(spans) || spans.length === 0) {
    return { resourceSpans: [] };
  }

  const groups = groupSpansByResource(spans.map(convertSpanToOTLP).filter(Boolean));

  return {
    resourceSpans: buildResourceSpans(groups)
  };
};

/**
 * Converts a single Instana span to OTLP format.
 *
 * @param {any} span
 * @returns {any|null}
 */
function convertSpanToOTLP(span) {
  try {
    return {
      ...extractMetaDataAttributes(span),
      attributes: extractSpanDataAttributes(span),
      resource: {
        attributes: extractResourceAttributes(span)
      }
    };
  } catch {
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
