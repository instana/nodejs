/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

const { expect } = require('chai');

const { isNodeVersionEOL } = require('../../src/util/eol');

describe('util/eol', () => {
  let originalPropertyDescriptor;

  before(() => {
    originalPropertyDescriptor = Object.getOwnPropertyDescriptor(process.versions, 'node');
  });

  afterEach(() => {
    Object.defineProperty(process.versions, 'node', originalPropertyDescriptor);
  });

  it('should not be detected as EOL when the Node.js version is not EOL', () => {
    Object.defineProperty(process.versions, 'node', {
      value: '42.43.44',
      writable: false
    });

    expect(isNodeVersionEOL()).to.be.false;
  });

  runEolTest('0.10.1');
  runEolTest('0.12.1');
  runEolTest('4.7.1');
  runEolTest('6.999.1111');
  runEolTest('14.13.3');
  runEolTest('15.16.17');
  runEolTest('17.0.0');
  runEolTest('21.0.3');

  function runEolTest(version) {
    it(`EOL should be detected when the Node.js version is EOL (${version})`, () => {
      Object.defineProperty(process.versions, 'node', {
        value: version,
        writable: false
      });
      expect(isNodeVersionEOL()).to.be.true;
    });
  }
});
