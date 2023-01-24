/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const mock = require('mock-require');
const requireHook = require('../../../../../core/src/util/requireHook');
const PINO_VERSION = process.env.PINO_VERSION;
const PINO_REQUIRE = `pino-v${PINO_VERSION}`;

if (PINO_REQUIRE !== 'pino') {
  mock('pino', PINO_REQUIRE);
}

/**
 * We monkey patch our own pino instrumentation.
 * The reason we have to do that is because we are testing against
 * x major versions. `mock-require` does not mock on fs level, only on
 * process level.
 *
 * If we test against `pino-v6`, we need to wait for the
 * on file load event for `node_modules/pino-v6/....js`
 */
const originalOnFileLoad = requireHook.onFileLoad;
requireHook.onFileLoad = function onFileLoad() {
  if (arguments[0].toString() !== '/\\/pino\\/lib\\/tools\\.js/') {
    return originalOnFileLoad.apply(this, arguments);
  }

  const str = `/${PINO_REQUIRE}/lib/tools.js`;
  const reg = new RegExp(str, '');
  arguments[0] = reg;
  return originalOnFileLoad.apply(this, arguments);
};
