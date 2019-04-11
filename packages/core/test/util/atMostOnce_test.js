/* eslint-env mocha */

'use strict';

var expect = require('chai').expect;
var sinon = require('sinon');

var atMostOnce = require('../../src/util/atMostOnce');

describe('util.atMostOnce', function() {
  var cb;

  beforeEach(function() {
    cb = sinon.stub();
  });

  it('should forward calls with parameters', function() {
    var wrapped = atMostOnce('test', cb);
    expect(cb.callCount).to.equal(0);

    wrapped('foo', true, 1);

    expect(cb.callCount).to.equal(1);
    expect(cb.getCall(0).args[0]).to.equal('foo');
    expect(cb.getCall(0).args[1]).to.equal(true);
    expect(cb.getCall(0).args[2]).to.equal(1);
  });

  it('should not permit any successive calls', function() {
    var wrapped = atMostOnce('test', cb);
    wrapped('a');

    wrapped();
    wrapped('c');

    expect(cb.callCount).to.equal(1);
    expect(cb.getCall(0).args[0]).to.equal('a');
  });
});
