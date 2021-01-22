/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. 2015
 */

'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');

const atMostOnce = require('../../src/util/atMostOnce');

describe('util.atMostOnce', () => {
  let cb;

  beforeEach(() => {
    cb = sinon.stub();
  });

  it('should forward calls with parameters', () => {
    const wrapped = atMostOnce('test', cb);
    expect(cb.callCount).to.equal(0);

    wrapped('foo', true, 1);

    expect(cb.callCount).to.equal(1);
    expect(cb.getCall(0).args[0]).to.equal('foo');
    expect(cb.getCall(0).args[1]).to.equal(true);
    expect(cb.getCall(0).args[2]).to.equal(1);
  });

  it('should not permit any successive calls', () => {
    const wrapped = atMostOnce('test', cb);
    wrapped('a');

    wrapped();
    wrapped('c');

    expect(cb.callCount).to.equal(1);
    expect(cb.getCall(0).args[0]).to.equal('a');
  });
});
