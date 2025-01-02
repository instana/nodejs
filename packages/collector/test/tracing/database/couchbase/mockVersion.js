/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const mock = require('@instana/core/test/test_util/mockRequire');
const COUCHBASE_VERSION = process.env.COUCHBASE_VERSION;
const COUCHBASE_REQUIRE = process.env.COUCHBASE_VERSION === 'latest' ? 'couchbase' : `couchbase-${COUCHBASE_VERSION}`;

if (COUCHBASE_REQUIRE !== 'couchbase') {
  mock('couchbase', COUCHBASE_REQUIRE);
}
