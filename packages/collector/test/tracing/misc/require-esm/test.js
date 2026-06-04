/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const config = require('@instana/core/test/config');

describe('tracing/misc/require-esm', function () {
  this.timeout(config.getTestTimeout() * 2);

  require('./test_base')();
});
