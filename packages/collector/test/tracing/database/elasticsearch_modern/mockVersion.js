/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const mock = require('mock-require');
const requireHook = require('../../../../../core/src/util/requireHook');
const ELASTIC_VERSION = process.env.ELASTIC_VERSION;
const ELASTIC_REQUIRE =
  process.env.ELASTIC_VERSION === 'latest' ? '@elastic/elasticsearch' : `@elastic/elasticsearch-v${ELASTIC_VERSION}`;

if (ELASTIC_REQUIRE !== '@elastic/elasticsearch') {
  mock('@elastic/elasticsearch', ELASTIC_REQUIRE);
}

const originalFn = requireHook.onModuleLoad;
requireHook.onModuleLoad = function onModuleLoad() {
  if (arguments[0] !== '@elastic/elasticsearch') {
    return originalFn.apply(this, arguments);
  }

  const origInstrument = arguments[1];
  arguments[1] = function fakeInstrument() {
    arguments[1] = require.resolve(ELASTIC_REQUIRE);
    return origInstrument.apply(this, arguments);
  };

  return originalFn.apply(this, arguments);
};
