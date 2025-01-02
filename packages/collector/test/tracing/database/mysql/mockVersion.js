/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const mock = require('@instana/core/test/test_util/mockRequire');
const MYSQL2_VERSION = process.env.MYSQL2_VERSION;
const MYSQL2_REQUIRE = process.env.MYSQL2_VERSION === 'latest' ? 'mysql2' : `mysql2-${MYSQL2_VERSION}`;

if (MYSQL2_REQUIRE !== 'mysql2') {
  mock('mysql2', MYSQL2_REQUIRE);
}
