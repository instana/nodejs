/*
 * (c) Copyright IBM Corp. 2022
 * (c) Copyright Instana Inc. and contributors 2022
 */

'use strict';

const semver = require('semver');
const path = require('path');
const mock = require('@_local/core/test/test_util/mockRequire');
const hook = require('../../../../../core/src/util/hook');

const graphqlMajorDefault = semver.major(require(`${path.dirname(require.resolve('graphql'))}/package.json`).version);
const GRAPHQL_VERSION = process.env.GRAPHQL_VERSION || graphqlMajorDefault.toString();
const GRAPHQL_REQUIRE = GRAPHQL_VERSION === graphqlMajorDefault.toString() ? 'graphql' : `graphql-v${GRAPHQL_VERSION}`;
process.env.GRAPHQL_REQUIRE = GRAPHQL_REQUIRE;

if (GRAPHQL_REQUIRE !== 'graphql') {
  mock('graphql', GRAPHQL_REQUIRE);

  /**
   * Subdependencies are not only using require('graphql'),
   * they also use specific requires such as e.g. require('graphql/language')
   *
   * We need to ensure that if we test against `node_modules/graphql-v16`,
   * everything needs to be "graphlq-v16" and not "graphql".
   */
  mock('graphql/language', `${GRAPHQL_REQUIRE}/language`);
  mock('graphql/execution', `${GRAPHQL_REQUIRE}/execution`);
  mock('graphql/utilities', `${GRAPHQL_REQUIRE}/utilities`);
  mock('graphql/jsutils', `${GRAPHQL_REQUIRE}/jsutils`);
  mock('graphql/validation', `${GRAPHQL_REQUIRE}/validation`);
  mock('graphql/type', `${GRAPHQL_REQUIRE}/type`);
  mock('graphql/polyfills', `${GRAPHQL_REQUIRE}/polyfills`);
  mock('graphql/subscription', `${GRAPHQL_REQUIRE}/subscription`);
  mock('graphql/error', `${GRAPHQL_REQUIRE}/error`);
}

/**
 * We monkey patch our own graphql instrumentation.
 * The reason we have to do that is because we are testing against
 * x major versions. `mock-require` does not mock on fs level, only on
 * process level.
 *
 * If we test against `graphql-v16`, we need to wait for the
 * on file load event for `node_modules/graphql-v16/execution/execution.js`
 */
const originalOnFileLoad = hook.onFileLoad;
hook.onFileLoad = function onFileLoad() {
  if (arguments[0].toString() !== '/\\/graphql\\/execution\\/execute.js/') {
    return originalOnFileLoad.apply(this, arguments);
  }
  const str = `/${GRAPHQL_REQUIRE}/execution/execute.js`;
  const reg = new RegExp(str, '');
  arguments[0] = reg;
  return originalOnFileLoad.apply(this, arguments);
};
