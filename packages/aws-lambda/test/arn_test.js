/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const expect = require('chai').expect;

const arnParser = require('../src/arn');

const unqualifiedArn = 'arn:aws:lambda:us-east-2:767398002385:function:demo-http-api';

describe('arn parser', () => {
  it('should parse $LATEST', () => {
    const arnInfo = arnParser({
      invokedFunctionArn: unqualifiedArn,
      functionVersion: '$LATEST'
    });
    expect(arnInfo.arn).to.equal(`${unqualifiedArn}:$LATEST`);
    expect(arnInfo.alias).to.not.exist;
  });

  it('should parse version', () => {
    const arnInfo = arnParser({
      invokedFunctionArn: unqualifiedArn,
      functionVersion: '42'
    });
    expect(arnInfo.arn).to.equal(`${unqualifiedArn}:42`);
    expect(arnInfo.alias).to.not.exist;
  });

  it('should parse aliased $LATEST', () => {
    const arnInfo = arnParser({
      invokedFunctionArn: `${unqualifiedArn}:thealias`,
      functionVersion: '$LATEST'
    });
    expect(arnInfo.arn).to.equal(`${unqualifiedArn}:$LATEST`);
    expect(arnInfo.alias).to.equal('thealias');
  });

  it('should parse aliased version', () => {
    const arnInfo = arnParser({
      invokedFunctionArn: `${unqualifiedArn}:thealias`,
      functionVersion: '42'
    });
    expect(arnInfo.arn).to.equal(`${unqualifiedArn}:42`);
    expect(arnInfo.alias).to.equal('thealias');
  });
});
