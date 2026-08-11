/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { StandardRetryStrategy } = require('@aws-sdk/middleware-retry');

exports.getClientConfig = function () {
  let endpoint = process.env.INSTANA_CONNECT_LOCALSTACK_AWS;
  if (endpoint) {
    if (endpoint.startsWith('localstack://')) {
      endpoint = endpoint.replace('localstack://', 'http://');
    }
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
