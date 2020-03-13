'use strict';

const expect = require('chai').expect;

const testUtils = require('../../core/test/test_util');
const name = require('../src/name');

describe('metrics.name', () => {
  it('should export a name payload prefix', () => {
    expect(name.payloadPrefix).to.equal('name');
  });

  it('should provide the main module name', () => {
    name.activate();

    return testUtils.retry(() => {
      // Mocha is used to execute the tests via the mocha executable.
      // As such mocha is the main module.
      expect(name.currentPayload).to.equal('mocha');
    });
  });
});
