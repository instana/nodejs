/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const path = require('path');
const ctx = require('../context');

const packageJson = require(path.join(__dirname, '..', '..', '..', '..', 'package.json'));

const SDK_VERSION = packageJson?.version || '1.0.0';

const SDK_DEFAULTS = {
  language: 'nodejs',
  name: 'instana',
  version: SDK_VERSION
};

const INSTRUMENTATION_SCOPE = {
  name: '@instana/collector',
  version: SDK_VERSION
};

/**
 * @param {Object} resourceAttributes
 * @param {Object} rawPayload
 * @param {Object} [options]
 * @returns {Array<Object>}
 */
function mapResourceAttributes(resourceAttributes = {}, rawPayload, options = {}) {
  const attrs = ctx.semConv.resource;

  const sourceMetadata = rawPayload?.f;

  const mappings = [
    {
      key: attrs.SERVICE_NAME,
      value: resourceAttributes[attrs.SERVICE_NAME] ?? ctx.serviceName
    },
    {
      key: attrs.SDK_LANGUAGE,
      value: resourceAttributes[attrs.SDK_LANGUAGE] ?? SDK_DEFAULTS.language
    },
    {
      key: attrs.SDK_NAME,
      value: resourceAttributes[attrs.SDK_NAME] ?? SDK_DEFAULTS.name
    },
    {
      key: attrs.SDK_VERSION,
      value: resourceAttributes[attrs.SDK_VERSION] ?? SDK_DEFAULTS.version
    }
  ];

  const attributes = [];

  mappings.forEach(mapping => {
    if (mapping.value !== undefined && mapping.value !== null) {
      attributes.push({
        key: mapping.key,
        value: {
          stringValue: String(mapping.value)
        }
      });
    }
  });

  const processId = sourceMetadata?.e || options.fallbackPid || ctx.pid;

  if (processId) {
    const pid = Number(processId);

    if (Number.isInteger(pid)) {
      attributes.push({
        key: attrs.PROCESS_PID,
        value: {
          intValue: pid
        }
      });
    }
  }

  const hostName = sourceMetadata?.h || ctx.hostId;

  if (hostName) {
    attributes.push({
      key: attrs.HOST_NAME,
      value: {
        stringValue: String(hostName)
      }
    });
  }

  return attributes;
}

module.exports = {
  mapResourceAttributes,
  INSTRUMENTATION_SCOPE
};
