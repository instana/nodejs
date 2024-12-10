/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const mock = require('mock-require');
const COUCHBASE_VERSION = process.env.COUCHBASE_VERSION;
const COUCHBASE_REQUIRE = process.env.COUCHBASE_VERSION === 'latest' ? 'couchbase' : `couchbase-${COUCHBASE_VERSION}`;

if (COUCHBASE_REQUIRE !== 'couchbase') {
  mock('couchbase', COUCHBASE_REQUIRE);
}
