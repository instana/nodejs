/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const mock = require('mock-require');
const requireHook = require('../../../../../core/src/util/requireHook');

const INSTANA_GRPC_VERSION = process.env.INSTANA_GRPC_VERSION;
const GRPC_REQUIRE =
  process.env.INSTANA_GRPC_VERSION === 'latest' ? '@grpc/grpc-js' : `@grpc/grpc-js-${INSTANA_GRPC_VERSION}`;

if (GRPC_REQUIRE !== '@grpc/grpc-js') {
  mock('@grpc/grpc-js', GRPC_REQUIRE);
}

const originalOnFileLoad = requireHook.onFileLoad;
requireHook.onFileLoad = function onFileLoad() {
  if (
    arguments[0].source === '\\/@grpc\\/grpc-js\\/build\\/src\\/server\\.js' ||
    arguments[0].source === '\\/@grpc\\/grpc-js\\/build\\/src\\/client\\.js'
  ) {
    const str = arguments[0].source.replace('@grpc\\/grpc-js', GRPC_REQUIRE);
    const reg = new RegExp(str, '');
    arguments[0] = reg;
    return originalOnFileLoad.apply(this, arguments);
  }

  return originalOnFileLoad.apply(this, arguments);
};
