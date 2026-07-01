/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { merge } = require('../merge');
const base = require('../base/mappings').MAPPINGS;
const { MAPPINGS } = require('./mappings');

// v1.23 semantic conventions - merge with base (which is now empty)
module.exports = merge(base, MAPPINGS);
