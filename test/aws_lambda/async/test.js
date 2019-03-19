'use strict';

const path = require('path');
const semver = require('semver');

const commonTests = require('../common/tests_common.js');

describe('aws/lambda/async', function() {
  if (semver.lt(process.version, '8.0.0')) {
    console.log(`Skipping tests for async function handlers in Node.js version ${process.version}`);
    return;
  }
  commonTests.registerTests.bind(this)(path.join(__dirname, './lambda'));
});
