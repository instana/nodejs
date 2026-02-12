/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2015
 */

'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const path = require('path');
const testUtils = require('@_local/core/test/test_util');
const name = require('../src/name');
const { applicationUnderMonitoring } = require('@_local/core').util;

describe('metrics.name', () => {
  before(() => {
    name.init({ logger: testUtils.createFakeLogger() });
  });

  afterEach(() => {
    name.reset();
    applicationUnderMonitoring.reset();
  });

  it('should export a name payload prefix', () => {
    expect(name.payloadPrefix).to.equal('name');
  });

  describe('when the package.json can be found', function () {
    it('it should extract the package.json name', async () => {
      name.activate();

      return testUtils.retry(() => {
        // Mocha is used to execute the tests via the mocha executable.
        // As such mocha is the main module.
        expect(name.currentPayload).to.equal('mocha');
      });
    });
  });

  describe('when the package.json cannot be found', function () {
    before(() => {
      sinon.stub(applicationUnderMonitoring, 'getMainPackageJsonStartingAtMainModule').callsFake(cb => {
        cb(null, null);
      });
    });

    after(() => {
      sinon.restore();
    });

    it('it should use the main module name', async () => {
      name.MAX_ATTEMPTS = 5;
      name.DELAY = 50;
      name.activate();

      return testUtils.retry(() => {
        expect(name.currentPayload).to.contain('node_modules/mocha/bin/mocha');
      });
    });
  });

  describe('when packageJsonPath is provided', function () {
    it('[absolute] it should use the provided package json', async () => {
      name.MAX_ATTEMPTS = 5;
      name.DELAY = 50;

      applicationUnderMonitoring.init({
        packageJsonPath: path.join(__dirname, './esm-require-in-preload/module/package.json')
      });

      name.activate();

      return testUtils.retry(() => {
        expect(name.currentPayload).to.contain('esm-require-in-preload');
      });
    });

    it('[relative] it should use the provided package json', async () => {
      name.MAX_ATTEMPTS = 5;
      name.DELAY = 50;

      applicationUnderMonitoring.init({
        // NOTE: relative to process.cwd()
        packageJsonPath: 'test/esm-require-in-preload/module/package.json'
      });

      name.activate();

      return testUtils.retry(() => {
        expect(name.currentPayload).to.contain('esm-require-in-preload');
      });
    });

    it('it should not use the provided package json', async () => {
      name.MAX_ATTEMPTS = 5;
      name.DELAY = 50;

      applicationUnderMonitoring.init({ packageJsonPath: null });

      name.activate();

      return testUtils.retry(() => {
        expect(name.currentPayload).to.contain('mocha');
      });
    });
  });
});
