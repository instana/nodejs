/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const mock = require('@instana/core/test/test_util/mockRequire');

const REDIS_PKG = process.env.REDIS_PKG;
const REDIS_VERSION = process.env.REDIS_VERSION;

let mockedModuleName;

if (REDIS_PKG === 'redis') {
  mockedModuleName = REDIS_VERSION === 'latest' ? 'redis' : `redis-${REDIS_VERSION}`;
} else if (REDIS_PKG === '@redis/client') {
  // NOTE: The @redis/client package was introduced with Redis v4 (client v1).
  // In Redis v5, the versioning of @redis/client was aligned with Redis itself,
  // so @redis/client v5 corresponds to Redis v5.
  mockedModuleName = REDIS_VERSION === 'latest' ? '@redis/client' : `@redis/client-${REDIS_VERSION}`;
}

if (mockedModuleName !== REDIS_PKG) {
  mock(REDIS_PKG, mockedModuleName);
}
