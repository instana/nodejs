/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const setupType = 'cluster';

describe(`tracing/redis/${setupType}`, function () {
  require('./test_definition').call(this, setupType);
});
