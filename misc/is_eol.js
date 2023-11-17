#!/usr/bin/env node
/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

/**
 * See https://github.com/nodejs/Release
 * Exits with exit 1 if running on Node.js > latest EOL version, otherwise with exit code 0.
 */
if (parseInt(/v(\d+)\./.exec(process.version)[1], 10) >= 18) {
  process.exit(1);
} else {
  process.exit(0);
}
