/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { merge } = require('../merge');
const base = require('../base/mappings').MAPPINGS;
const { MAPPINGS } = require('./mappings');

// v1.23 has no overrides, so we just merge with empty object
// This returns a frozen copy of the base mappings
module.exports = merge(base, MAPPINGS);
