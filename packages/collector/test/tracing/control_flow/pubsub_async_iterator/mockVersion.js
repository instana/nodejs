/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const mock = require('@_local/core/test/test_util/mockRequire');
const hook = require('@_local/core/src/util/hook');

const GRAPHQL_SUBSCRIPTIONS_VERSION = process.env.GRAPHQL_SUBSCRIPTIONS_VERSION;
const GRAPHQL_SUBSCRIPTIONS_REQUIRE =
  process.env.GRAPHQL_SUBSCRIPTIONS_VERSION === 'latest'
    ? 'graphql-subscriptions'
    : `graphql-subscriptions-${GRAPHQL_SUBSCRIPTIONS_VERSION}`;

if (GRAPHQL_SUBSCRIPTIONS_REQUIRE !== 'graphql-subscriptions') {
  mock('graphql-subscriptions', GRAPHQL_SUBSCRIPTIONS_REQUIRE);
}

const originalOnFileLoad = hook.onFileLoad;
hook.onFileLoad = function onFileLoad() {
  if (arguments[0].source === '\\/graphql-subscriptions\\/dist\\/pubsub-async-iterator\\.js') {
    const str = arguments[0].source.replace('graphql-subscriptions', GRAPHQL_SUBSCRIPTIONS_REQUIRE);
    const reg = new RegExp(str, '');
    arguments[0] = reg;
    return originalOnFileLoad.apply(this, arguments);
  }

  return originalOnFileLoad.apply(this, arguments);
};
