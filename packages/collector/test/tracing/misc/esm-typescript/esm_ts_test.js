/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const expect = require('chai').expect;
const { execSync } = require('child_process');
const config = require('@instana/core/test/config');

describe('ESM Typescript App', function () {
  this.timeout(config.getTestTimeout() * 2);

  before(() => {
    execSync('npm run build', { cwd: __dirname, stdio: 'inherit' });
  });

  it('[app_1] should be able to load Instana SDK', () => {
    const exported = require('./dist/app_1');
    expect(exported).to.be.an('object');

    // This is `.default` because we transform it back into CJS. Its correct in the esm app.
    expect(exported.default.sdk).to.exist;
  });

  it('[app_2] should be able to load Instana SDK', () => {
    const exported = require('./dist/app_2');
    expect(exported).to.be.an('object');

    // This is `.default` because we transform it back into CJS. Its correct in the esm app.
    expect(exported.default.sdk).to.exist;
  });
});
