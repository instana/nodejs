/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const setupType = 'default';

describe.only(`tracing/redis/${setupType}`, function () {
  require('./test_definition').call(this, setupType);

  // legacy mode
  require('./test_definition').call(this, setupType, true);
});
