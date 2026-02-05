/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

/** THIS IS A GENERATED FILE. DO NOT MODIFY IT. */

const { execSync } = require('child_process');
const path = require('path');
const testBase = require('./test_base');
const config = require('@_instana/core/test/config');

describe('tracing/pg@v8', function () {
  this.timeout(config.getTestTimeout());

  before(() => {
    execSync('rm -rf node_modules', { cwd: __dirname, stdio: 'inherit' });
    execSync('npm install --no-audit --prefix ./', { cwd: __dirname, stdio: 'inherit' });
  });

  testBase.call(this, 'pg', '8.17.1', true);
});
