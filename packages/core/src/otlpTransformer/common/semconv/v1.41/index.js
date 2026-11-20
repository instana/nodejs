/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { merge } = require('../merge');
const base = require('../base/mappings').MAPPINGS;
const { MAPPINGS } = require('./mappings');

module.exports = merge(base, MAPPINGS);
