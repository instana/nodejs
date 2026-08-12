/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { StandardRetryStrategy } = require('@aws-sdk/middleware-retry');

function getLocalstackEndpoint() {
  if (process.env.RUN_AWS === 'true') return null;
  let endpoint = process.env.INSTANA_CONNECT_LOCALSTACK_AWS;
  if (!endpoint) return null;
  if (endpoint.startsWith('localstack://')) {
    endpoint = endpoint.replace('localstack://', 'http://');
  }
  return endpoint;
}

exports.getClientConfig = function () {
  const endpoint = getLocalstackEndpoint();
  if (endpoint) {
    const customRetryStrategy = new StandardRetryStrategy(async () => 6, {
      retryDecider: () => true,
      delayDecider: () => 5000
    });
    return {
      region: 'us-east-2',
      endpoint,
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
      retryStrategy: customRetryStrategy
    };
  }
  return { region: 'us-east-2' };
};
