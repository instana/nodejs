/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

/**
 * Shared localstack / AWS test utilities for @aws-sdk (v3) test apps.

/**
 * Returns the localstack endpoint URL, or null when running against real AWS.
 * @returns {string|null}
 */
function getLocalstackEndpoint() {
  if (process.env.RUN_AWS === 'true') return null;
  let endpoint = process.env.INSTANA_CONNECT_LOCALSTACK_AWS;
  if (!endpoint) return null;
  if (endpoint.startsWith('localstack://')) {
    endpoint = endpoint.replace('localstack://', 'http://');
  }
  return endpoint;
}

/**
 * Returns an AWS SDK v3 client configuration object.
 * When a localstack endpoint is detected, test credentials and the endpoint
 * are included; otherwise only the region is set.
 * @param {object} [extraOptions] - additional properties merged into the config
 * @returns {object}
 */
function getClientConfig(extraOptions) {
  const endpoint = getLocalstackEndpoint();
  if (endpoint) {
    return Object.assign(
      {
        region: 'us-east-2',
        endpoint,
        credentials: {
          accessKeyId: 'test',
          secretAccessKey: 'test'
        }
      },
      extraOptions
    );
  }
  return { region: 'us-east-2' };
}

exports.getLocalstackEndpoint = getLocalstackEndpoint;
exports.getClientConfig = getClientConfig;
