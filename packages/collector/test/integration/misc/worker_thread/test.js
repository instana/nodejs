/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const supportedVersion = require('@_local/core').tracing.supportedVersion;
const config = require('@_local/core/test/config');

const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

mochaSuiteFn.only('worker thread', function () {
  this.timeout(config.getTestTimeout());

  require('./test_base')();
});
