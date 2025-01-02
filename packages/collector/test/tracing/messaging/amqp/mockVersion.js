/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

const Module = require('module');
const mock = require('@instana/core/test/test_util/mockRequire');
const hook = require('../../../../../core/src/util/hook');

const AMQPLIB_REQUIRE = process.env.AMQPLIB_VERSION === 'latest' ? 'amqplib' : `amqplib-${process.env.AMQPLIB_VERSION}`;

if (AMQPLIB_REQUIRE !== 'amqplib') {
  mock('amqplib', AMQPLIB_REQUIRE);
}

/**
 * We monkey patch our own amqplib instrumentation.
 * The reason we have to do that is because we are testing against
 * x major versions. `mock-require` does not mock on fs level, only on
 * process level.
 *
 * If we test against `amqplib-v0.8.0`, we need to wait for the
 * on file load event for `node_modules/amqplib-v0.8.0/lib/...
 */
const originalOnFileLoad = hook.onFileLoad;
hook.onFileLoad = function onFileLoad() {
  if (
    arguments[0].source === '\\/amqplib\\/lib\\/channel\\.js' ||
    arguments[0].source === '\\/amqplib\\/lib\\/channel_model\\.js' ||
    arguments[0].source === '\\/amqplib\\/lib\\/callback_model\\.js'
  ) {
    const str = arguments[0].source.replace('amqplib', AMQPLIB_REQUIRE);
    const reg = new RegExp(str, '');
    arguments[0] = reg;
    return originalOnFileLoad.apply(this, arguments);
  }

  return originalOnFileLoad.apply(this, arguments);
};

// https://github.com/amqp-node/amqplib/blob/v0.10.3/callback_api.js#LL2C36-L2C50
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function amqpMockVersionOverride() {
  let result = originalResolveFilename.apply(this, arguments);
  if (result.indexOf('amqplib/lib/callback_model.js') !== -1) {
    result = result.replace('amqplib', AMQPLIB_REQUIRE);
  }
  return result;
};
