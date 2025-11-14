/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const expect = require('chai').expect;

const { isNodeJsTooOld } = require('../../src/util/nodeJsVersionCheck');

describe('util.nodeJsTooOld', () => {
  const originalProcessVersion = process.version;

  afterEach(() => {
    // Simply executing process.version = ... would result in
    // Cannot assign to read only property 'version' of object '#<process>'
    Object.defineProperty(process, 'version', { value: originalProcessVersion, writable: false });
  });

  it('should reject Node.js 0.10', () => {
    setProcessVersion('v0.10.48');
    expect(isNodeJsTooOld()).to.be.true;
  });

  it('should reject Node.js 4', () => {
    setProcessVersion('v4.9.1');
    expect(isNodeJsTooOld()).to.be.true;
  });

  it('should reject Node.js 6', () => {
    setProcessVersion('v6.17.1');
    expect(isNodeJsTooOld()).to.be.true;
  });

  it('should reject Node.js 8', () => {
    setProcessVersion('v8.17.0');
    expect(isNodeJsTooOld()).to.be.true;
  });

  it('should reject Node.js 8 when 10 is the default', () => {
    setProcessVersion('v8.17.0');
    expect(isNodeJsTooOld()).to.be.true;
  });

  it('should reject Node.js 9', () => {
    setProcessVersion('v9.11.2');
    expect(isNodeJsTooOld()).to.be.true;
  });

  it('should reject Node.js 10', () => {
    setProcessVersion('v10.0.0');
    expect(isNodeJsTooOld()).to.be.true;
  });

  it('should reject Node.js 11', () => {
    setProcessVersion('v11.0.0');
    expect(isNodeJsTooOld()).to.be.true;
  });

  it('should reject Node.js 12', () => {
    setProcessVersion('v12.22.8');
    expect(isNodeJsTooOld()).to.be.true;
  });

  it('should accept Node.js 14', () => {
    setProcessVersion('v14.18.2');
    expect(isNodeJsTooOld()).to.be.true;
  });

  it('should accept Node.js 16', () => {
    setProcessVersion('v16.13.1');
    expect(isNodeJsTooOld(10)).to.be.true;
  });

  it('should accept Node.js 17', () => {
    setProcessVersion('v17.3.0');
    expect(isNodeJsTooOld()).to.be.true;
  });

  it('should reject Node.js 18.18.0', () => {
    setProcessVersion('v18.18.0');
    expect(isNodeJsTooOld()).to.be.true;
  });

  it('should reject Node.js 18.18.9', () => {
    setProcessVersion('v18.18.0');
    expect(isNodeJsTooOld()).to.be.true;
  });

  it('should accept Node.js 18.19.0', () => {
    setProcessVersion('v18.19.0');
    expect(isNodeJsTooOld()).to.be.false;
  });

  it('should accept if process.version is not set', () => {
    setProcessVersion(undefined);
    expect(isNodeJsTooOld()).to.be.false;
  });

  it('should accept if process.version is not a string', () => {
    setProcessVersion(1234);
    expect(isNodeJsTooOld()).to.be.false;
  });

  it('should accept if process.version is in an unexpected format (not major.minor.patch)', () => {
    setProcessVersion('v123');
    expect(isNodeJsTooOld()).to.be.false;
  });

  it('should accept if process.version is in an unexpected format (no v prefix)', () => {
    setProcessVersion('11.22.33');
    expect(isNodeJsTooOld()).to.be.false;
  });
});

function setProcessVersion(version) {
  // Simply executing process.version = ... would result in
  // Cannot assign to read only property 'version' of object '#<process>'
  Object.defineProperty(process, 'version', { value: version, writable: true });
}
