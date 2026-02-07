/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const mock = require('@_local/core/test/test_util/mockRequire');

const REDIS_VERSION = process.env.REDIS_VERSION;
const REDIS_REQUIRE = process.env.REDIS_VERSION === 'latest' ? 'redis' : `redis-${REDIS_VERSION}`;

if (REDIS_REQUIRE !== 'redis') {
  mock('redis', REDIS_REQUIRE);
}
