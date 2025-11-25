/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2015
 */

'use strict';

const expect = require('chai').expect;
const fs = require('fs');
const path = require('path');
const testUtils = require('../../core/test/test_util');
const name = require('../src/name');

describe('metrics.name', () => {
  before(() => {
    name.init({ logger: testUtils.createFakeLogger() });
  });

  afterEach(() => {
    name.reset();
  });

  it('should export a name payload prefix', () => {
    expect(name.payloadPrefix).to.equal('name');
  });

  describe('when the package.json can be found', function () {
    it('it should extract the package.json name', async () => {
      const anyPackageJsonPath = path.join(path.dirname(require.resolve('mocha')), 'package.json');
      const anyPackageJsonFile = JSON.parse(fs.readFileSync(anyPackageJsonPath, 'utf8'));

      name.activate({}, { file: anyPackageJsonFile, path: anyPackageJsonPath });

      return testUtils.retry(() => {
        // Mocha is used to execute the tests via the mocha executable.
        // As such mocha is the main module.
        expect(name.currentPayload).to.equal('mocha');
      });
    });
  });

  describe('when the package.json cannot be found', function () {
    it('it should use the main module name', async () => {
      name.activate({}, { file: null, path: null });

      return testUtils.retry(() => {
        expect(name.currentPayload).to.contain('node_modules/mocha/bin/mocha');
      });
    });
  });
});
