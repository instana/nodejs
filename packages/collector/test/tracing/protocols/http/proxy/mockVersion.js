/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const mock = require('@instana/core/test/test_util/mockRequire');
const EXPRESS_VERSION = process.env.EXPRESS_VERSION;
const EXPRESS_REQUIRE = process.env.EXPRESS_VERSION === 'latest' ? 'express' : `express-${EXPRESS_VERSION}`;

if (EXPRESS_REQUIRE !== 'express') {
  mock('express', EXPRESS_REQUIRE);
}
