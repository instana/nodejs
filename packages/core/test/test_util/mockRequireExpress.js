/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

// This file defaults to requiring express v4 if no version is specified

const mock = require('./mockRequire');
const EXPRESS_VERSION = process.env.EXPRESS_VERSION || 'v4';
const EXPRESS_REQUIRE = process.env.EXPRESS_VERSION === 'latest' ? 'express' : `express-${EXPRESS_VERSION}`;

if (EXPRESS_REQUIRE !== 'express') {
  mock('express', EXPRESS_REQUIRE);
}
