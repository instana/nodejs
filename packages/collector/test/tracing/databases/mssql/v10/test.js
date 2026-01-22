/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { execSync } = require('child_process');
const path = require('path');
const testBase = require('./test_base');
const root = global.findRootFolder();
const config = require(path.join(root, 'packages', 'core', 'test', 'config'));
describe('tracing/mssql@v10', function () {
  this.timeout(config.getTestTimeout());
  before(() => {
    execSync('rm -rf node_modules', { cwd: __dirname, stdio: 'inherit' });
    execSync('npm install --no-audit --prefix ./', { cwd: __dirname, stdio: 'inherit' });
  });

  testBase.call(this);
});
