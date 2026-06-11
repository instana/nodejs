/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const transformers = require('./transformers');
const resourceFactory = require('../common/resource');
const { SCOPE_NAME, SCOPE_VERSION } = require('../common/resource');
const { isLogSpan } = require('./util');

const SCOPE = {
  name: SCOPE_NAME,
  version: SCOPE_VERSION
};

let logger;

/**
 * @param {Object} config
 */
function init(config) {
  logger = config?.logger;
}

/**
 * @param {Array<Object>} spans
 * @returns {Object} Payload matching { resourceSpans: [...] }
 */
function convert(spans) {
  if (!Array.isArray(spans) || spans.length === 0) {
    return { resourceSpans: [] };
  }

  const resourceGroupMap = new Map();

  spans.forEach(rawSpan => {
    if (isLogSpan(rawSpan)) {
      // logSignalExporter(span);
      return;
    }

    try {
      const mappedSpan = {
        ...transformers.spanMetaData.extractSpanMetadata(rawSpan),
        attributes: transformers.spanAttributes.extractSpanAttributes(rawSpan)
      };

      const originFrom = rawSpan.data?.resource || null;
      const rKey = resourceFactory.getResourceKey(originFrom);

      if (!resourceGroupMap.has(rKey)) {
        resourceGroupMap.set(rKey, {
          representativeSpan: rawSpan,
          otelSpans: []
        });
      }

      resourceGroupMap.get(rKey).otelSpans.push(mappedSpan);
    } catch (error) {
      logger?.debug('Failed to transform individual OTLP span context:', error);
    }
  });

  const resourceSpans = Array.from(resourceGroupMap.values()).map(group => ({
    resource: resourceFactory.extractResourceAttributes(group.representativeSpan),
    scopeSpans: [
      {
        scope: SCOPE,
        spans: group.otelSpans
      }
    ]
  }));

  return { resourceSpans };
}

module.exports = {
  init,
  convert
};
