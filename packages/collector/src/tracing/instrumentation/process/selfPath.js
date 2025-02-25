/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const path = require('path');
const { uninstrumentedFs: fs } = require('@instana/core');

// @ts-ignore - Cannot redeclare exported variable
exports.immediate = path.join(__dirname, '..', '..', '..', 'immediate.js');

if (!fs.existsSync(exports.immediate)) {
  exports.immediate = null;
}
