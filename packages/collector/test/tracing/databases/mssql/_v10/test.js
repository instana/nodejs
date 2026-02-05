/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

/** THIS IS A GENERATED FILE. DO NOT MODIFY IT. */

const { execSync } = require('child_process');
const path = require('path');
const testBase = require('./test_base');
const config = require('@_instana/core/test/config');
const supportedVersion = require('@_instana/core').tracing.supportedVersion;
const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

mochaSuiteFn('tracing/mssql@v10', function () {
  this.timeout(config.getTestTimeout());

  before(() => {
    execSync('rm -rf node_modules', { cwd: __dirname, stdio: 'inherit' });
    execSync('npm install --no-audit --prefix ./', { cwd: __dirname, stdio: 'inherit' });
  });

  testBase.call(this, 'mssql', '10.0.4', false);
});
