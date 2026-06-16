/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const path = require('path');
const ctx = require('../context');
const { computeProcessId, computeHostName } = require('./helper');

const packageJson = require(path.join(__dirname, '..', '..', '..', '..', 'package.json'));

const SDK_VERSION = packageJson?.version || '1.0.0';

const SDK_LANGUAGE = 'nodejs';
const SDK_NAME = 'instana';

const INSTRUMENTATION_SCOPE = {
  name: '@instana/collector',
  version: SDK_VERSION
};

/**
 * @param {Object} OTLP
 */
function getResourceMappings(OTLP) {
  const attrs = OTLP.resource;

  return {
    directMappings: {
      service_name: {
        otlp: attrs.SERVICE_NAME,
        transform: (value, resource) => value ?? resource[attrs.SERVICE_NAME] ?? ctx.serviceName
      },
      sdk_language: {
        otlp: attrs.SDK_LANGUAGE,
        transform: (value, resource) => value ?? resource[attrs.SDK_LANGUAGE] ?? SDK_LANGUAGE
      },
      sdk_name: {
        otlp: attrs.SDK_NAME,
        transform: (value, resource) => value ?? resource[attrs.SDK_NAME] ?? SDK_NAME
      },
      sdk_version: {
        otlp: attrs.SDK_VERSION,
        transform: (value, resource) => value ?? resource[attrs.SDK_VERSION] ?? SDK_VERSION
      }
    },

    computedMappings: [
      {
        otlp: attrs.PROCESS_PID,
        valueType: 'int',
        compute: computeProcessId
      },
      {
        otlp: attrs.HOST_NAME,
        valueType: 'string',
        compute: computeHostName
      }
    ]
  };
}

module.exports = {
  getResourceMappings,
  INSTRUMENTATION_SCOPE
};
