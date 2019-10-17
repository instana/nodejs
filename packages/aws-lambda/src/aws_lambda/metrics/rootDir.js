'use strict';

const path = require('path');

// We should be in /var/task/node_modules/@instana/aws-lambda/src/aws_lambda/metrics initially, provide
// /var/task as the starting dir for looking for the handler's package.json.
exports.root = path.resolve(__dirname, '..', '..', '..', '..', '..', '..');
