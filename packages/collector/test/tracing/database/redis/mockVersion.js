/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const path = require('path');
const mock = require('@instana/core/test/test_util/mockRequire');
const hook = require('../../../../../core/src/util/hook');

const REDIS_PKG = process.env.REDIS_PKG;
const REDIS_VERSION = process.env.REDIS_VERSION;

let mockedModuleName;

if (REDIS_PKG === 'redis') {
  mockedModuleName = REDIS_VERSION === 'latest' ? 'redis' : `redis-${REDIS_VERSION}`;
} else if (REDIS_PKG === '@redis/client') {
  // NOTE: The '@redis/client' package was introduced with Redis v4 (client v1).
  // In Redis v5, the versioning of '@redis/client' was aligned with Redis itself,
  // so '@redis/client' v5 corresponds to Redis v5.
  mockedModuleName = REDIS_VERSION === 'latest' ? '@redis/client' : `@redis/client-${REDIS_VERSION}`;
}

// The 'redis' package is also installed in the collector package due to the typeorm dependency.
// To ensure we override the default resolution (which would load 'redis' from the collector's node_modules),
// we explicitly point to the root-level node_modules.
const nodeModulesPath = path.resolve(__dirname, '../../../../../../node_modules');
const mockModuleFullPath = path.join(nodeModulesPath, mockedModuleName);
mock(REDIS_PKG, mockModuleFullPath);

const originalOnFileLoad = hook.onFileLoad;

hook.onFileLoad = function onFileLoad() {
  const source = arguments[0]?.source;

  if (
    mockedModuleName.startsWith('@redis/client') &&
    (source === '\\/@redis\\/client\\/dist\\/lib\\/commands\\/index.js' ||
      source === '\\/@redis\\/client\\/dist\\/lib\\/cluster\\/commands.js')
  ) {
    const updatedSource = source.replace('@redis\\/client', mockedModuleName);

    const regex = new RegExp(updatedSource);
    arguments[0] = regex;

    return originalOnFileLoad.apply(this, arguments);
  }

  return originalOnFileLoad.apply(this, arguments);
};
