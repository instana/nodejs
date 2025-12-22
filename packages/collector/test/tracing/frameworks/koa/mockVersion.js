/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const mock = require('@instana/core/test/test_util/mockRequire');
const KOA_ROUTER_VERSION = process.env.KOA_ROUTER_VERSION;
const KOA_ROUTER_REQUIRE =
  process.env.KOA_ROUTER_VERSION === 'latest' ? '@koa/router' : `@koa/router-${KOA_ROUTER_VERSION}`;

if (KOA_ROUTER_REQUIRE !== '@koa/router') {
  mock('@koa/router', KOA_ROUTER_REQUIRE);
}
