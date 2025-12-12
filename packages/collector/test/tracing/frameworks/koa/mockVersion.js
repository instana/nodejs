/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const mock = require('@instana/core/test/test_util/mockRequire');
const KOA_VERSION = process.env.KOA_VERSION;
const KOA_REQUIRE = process.env.KOA_VERSION === 'latest' ? '@koa/router' : `@koa/router-${KOA_VERSION}`;

if (KOA_REQUIRE !== '@koa/router') {
  mock('@koa/router', KOA_REQUIRE);
}
