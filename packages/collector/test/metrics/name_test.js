/* eslint-env mocha */

'use strict';

const expect = require('chai').expect;

const utils = require('../utils');
const name = require('../../src/metrics/name');

describe('metrics.name', () => {
  it('should export a name payload prefix', () => {
    expect(name.payloadPrefix).to.equal('name');
  });

  it('should provide the main module name', () => {
    name.activate();

    return utils.retry(() => {
      // Mocha is used to execute the tests via the mocha executable.
      // As such mocha is the main module.
      expect(name.currentPayload).to.equal('mocha');
    });
  });
});
