/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2015
 */

'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const testUtils = require('../../core/test/test_util');
const name = require('../src/name');
const { applicationUnderMonitoring } = require('@instana/core').util;

describe('metrics.name', () => {
  afterEach(() => {
    name.reset();
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
});
