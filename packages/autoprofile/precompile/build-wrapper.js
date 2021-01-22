#!/usr/bin/env node
/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. 2020
 */

'use strict';

// This file is used as the executable in the Docker based builds.

const abi = process.argv[2];
const version = process.argv[3];

if (!abi) {
  console.error('Missing mandatory parameter Node.js ABI');
  process.exit(1);
}
if (!version) {
  console.error('Missing mandatory parameter Node.js version');
  process.exit(1);
}

console.log('abi version', abi, version);

require('./build-single-addon')(abi, version);
