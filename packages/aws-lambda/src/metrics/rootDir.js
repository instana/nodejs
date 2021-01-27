/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const path = require('path');

// We should be in /var/task/node_modules/@instana/aws-lambda/src/metrics initially, provide
// /var/task as the starting dir for looking for the handler's package.json.
exports.root = path.resolve(__dirname, '..', '..', '..', '..', '..');
