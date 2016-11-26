/* eslint-env mocha */

'use strict';

var supportsAsyncWrap = require('./index').supportsAsyncWrap;
var proxyquire = require('proxyquire');
var expect = require('chai').expect;


describe('tracing/hook', function() {
  if (!supportsAsyncWrap(process.versions.node)) {
    return;
  }

  var hook;

  beforeEach(function() {
    // reload to clear vars
    hook = proxyquire('./hook', {});
  });

  it('must not have an active uid initially', function() {
    expect(hook.getCurrentUid()).to.equal(null);
  });

  it('must initialize new handles', function() {
    hook.initAsync(1);
    hook.preAsync(1);
    expect(hook.getCurrentUid()).to.equal(1);
  });

  it('must set parent span IDs', function() {
    hook.initAsync(1);
    hook.preAsync(1);
    hook.setSpanId(1, 'span1');

    hook.initAsync(2);
    hook.preAsync(2);

    expect(hook.getParentSpanId(2)).to.equal('span1');
  });

  it('must pass parent span IDs across a handle without tracing informaton', function() {
    hook.initAsync(1);
    hook.preAsync(1);
    hook.setSpanId(1, 'span1');

    hook.initAsync(2);
    hook.preAsync(2);

    hook.initAsync(3);
    hook.preAsync(3);

    expect(hook.getParentSpanId(3)).to.equal('span1');
  });

  it('must transport trace id across handles', function() {
    hook.initAsync(1);
    hook.preAsync(1);
    hook.setTraceId(1, 'span1');

    hook.initAsync(2);
    hook.preAsync(2);

    hook.initAsync(3);
    hook.preAsync(3);

    expect(hook.getTraceId(2)).to.equal('span1');
    expect(hook.getTraceId(3)).to.equal('span1');
  });

  it('must set new parent span IDs due to intermediate spans', function() {
    hook.initAsync(1);
    hook.preAsync(1);
    hook.setSpanId(1, 'span1');

    hook.initAsync(2);
    hook.preAsync(2);
    hook.setSpanId(2, 'span2');

    hook.initAsync(3);
    hook.preAsync(3);

    expect(hook.getParentSpanId(2)).to.equal('span1');
    expect(hook.getParentSpanId(3)).to.equal('span2');
  });

  it('must pass trace suppression configuration across handles', function() {
    hook.initAsync(1);
    hook.preAsync(1);

    hook.initAsync(2);
    hook.preAsync(2);
    hook.setTracingSuppressed(2, true);

    hook.initAsync(3);
    hook.preAsync(3);

    expect(hook.isTracingSuppressed(1)).to.equal(false);
    expect(hook.isTracingSuppressed(2)).to.equal(true);
    expect(hook.isTracingSuppressed(3)).to.equal(true);
  });
});
