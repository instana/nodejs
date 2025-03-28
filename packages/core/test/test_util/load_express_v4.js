/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const mock = require('./mockRequire');
const EXPRESS_VERSION = 'v4';
const EXPRESS_REQUIRE = `express-${EXPRESS_VERSION}`;

mock('express', EXPRESS_REQUIRE);
