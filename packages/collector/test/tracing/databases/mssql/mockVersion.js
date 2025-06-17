/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const mock = require('@instana/core/test/test_util/mockRequire');

const MSSQL_VERSION = process.env.MSSQL_VERSION;
const MSSQL_REQUIRE = process.env.MSSQL_VERSION === 'latest' ? 'mssql' : `mssql-${MSSQL_VERSION}`;

if (MSSQL_REQUIRE !== 'mssql') {
  mock('mssql', MSSQL_REQUIRE);
}
