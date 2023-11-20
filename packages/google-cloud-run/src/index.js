/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const path = require('path');

try {
  // eslint-disable-next-line no-console
  console.log('@instana/google-cloud-run module version:', require(path.join(__dirname, '..', 'package.json')).version);
  module.exports = exports = require('./preactivate');
} catch (e) {
  // ignore all runtime errors
  // eslint-disable-next-line no-console
  console.error(e);
}
