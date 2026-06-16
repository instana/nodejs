/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const resourceMapper = require('../mappers/resource');

/**
 * @param {Object} rawPayload
 * @param {Object} [options]
 * @returns {{ attributes: Array<Object> }}
 */
function extractResourceAttributes(rawPayload, options = {}) {
  if (!rawPayload) {
    return { attributes: [] };
  }

  const resourceAttributes = rawPayload.data?.resource || rawPayload.resource || {};

  return {
    attributes: resourceMapper.mapResourceAttributes(resourceAttributes, rawPayload, options)
  };
}

module.exports = {
  extractResourceAttributes
};
