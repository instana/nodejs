/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

/**
 *
 * @param {Object} rawPayload
 * @param {Object} resourceMappings
 * @returns {{ attributes: Array<Object> }}
 */
function extractResourceAttributes(rawPayload, resourceMappings) {
  if (!rawPayload) {
    return { attributes: [] };
  }

  const { directMappings, computedMappings } = resourceMappings;

  const sourceMetadata = rawPayload.f || null;
  const resourceAttributes = rawPayload.data?.resource || rawPayload.resource || {};

  const attributes = [];

  Object.keys(directMappings).forEach(field => {
    const mapping = directMappings[field];
    const value = resourceAttributes[field];

    if (value !== undefined || mapping.transform) {
      const transformedValue =
        typeof mapping.transform === 'function' ? mapping.transform(value, resourceAttributes) : value;

      if (transformedValue !== undefined && transformedValue !== null) {
        attributes.push({
          key: mapping.otlp,
          value: { stringValue: String(transformedValue) }
        });
      }
    }
  });

  computedMappings.forEach(mapping => {
    if (typeof mapping.compute === 'function') {
      const value = mapping.compute(sourceMetadata);

      if (value !== null && value !== undefined) {
        attributes.push({
          key: mapping.otlp,
          value: mapping.valueType === 'int' ? { intValue: value } : { stringValue: String(value) }
        });
      }
    }
  });

  return { attributes };
}

module.exports = {
  extractResourceAttributes
};
