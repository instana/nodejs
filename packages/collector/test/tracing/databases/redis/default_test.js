/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const setupType = 'default';

describe(`tracing/redis/${setupType}`, function () {
  require('./test_definition').call(this, setupType);
});
