/* eslint-env mocha */

'use strict';

var proxyquire = require('proxyquire');
var expect = require('chai').expect;


describe.only('tracing/cls', function() {
  var cls;

  beforeEach(function() {
    // reload to clear vars
    cls = proxyquire('./cls', {});
    cls.stanStorage.run(() => { cls.reset(); });
  });

  it('must not have an active context initially', function() {
    expect(cls.getActiveContext()).to.equal(undefined);
  });

  it('must initialize a new valid context', function() {
    var newContext = cls.createContext();
    expect(newContext).to.be.a('Object');
    expect(newContext).to.have.property('uid');
    expect(newContext).to.have.property('parentUid');
    expect(newContext).to.have.property('spanId');
    expect(newContext).to.have.property('traceId');
    expect(newContext).to.have.property('suppressTracing');
    expect(newContext).to.have.property('containsExitSpan');
  });

  it('new context must inherit parent span IDs', function() {
    var parentContext;
    var newContext;

    cls.stanStorage.run(() => {
      parentContext = cls.createContext();
      parentContext.spanId = 'span1';
      cls.setActiveContext(parentContext);
      newContext = cls.createContext();
    });
    expect(newContext.parentSpanId).to.equal('span1');
  });

  it('must validate that context exists by Uid', function() {
    var parentContext;
    var childContext;
    var parentExists = false;
    var childExists = false;

    cls.stanStorage.run(() => {
      parentContext = cls.createContext();
      cls.setActiveContext(parentContext);
      childContext = cls.createContext();
      cls.setActiveContext(childContext);

      parentExists = cls.contextExistsByUid(parentContext.uid);
      childExists = cls.contextExistsByUid(childContext.uid);
    });

    expect(parentExists).to.equal(true);
    expect(childExists).to.equal(true);
  });

  it('must transport trace id across handles', function() {
    var parentContext;
    var newContext1;
    var newContext2;

    cls.stanStorage.run(() => {
      parentContext = cls.createContext();
      parentContext.traceId = 'traceId1';
      cls.setActiveContext(parentContext);

      newContext1 = cls.createContext();
      newContext2 = cls.createContext();
    });

    expect(parentContext.traceId).to.equal('traceId1');
    expect(newContext1.traceId).to.equal('traceId1');
    expect(newContext2.traceId).to.equal('traceId1');
  });

  it('must set new parent span IDs due to intermediate spans', function() {
    var parentContext;
    var intermediateContext;
    var lastContext;

    cls.stanStorage.run(() => {
      parentContext = cls.createContext();
      parentContext.spanId = 'span1';
      cls.setActiveContext(parentContext);

      intermediateContext = cls.createContext();
      intermediateContext.spanId = 'span2';
      cls.setActiveContext(intermediateContext);

      lastContext = cls.createContext();
      cls.setActiveContext(lastContext);
    });
    expect(intermediateContext.parentSpanId).to.equal('span1');
    expect(lastContext.parentSpanId).to.equal('span2');
  });

  it('must pass trace suppression configuration across handles', function() {
    var parentContext;
    var intermediateContext;
    var lastContext;

    cls.stanStorage.run(() => {
      parentContext = cls.createContext();
      parentContext.suppressTracing = true;
      cls.setActiveContext(parentContext);

      intermediateContext = cls.createContext();
      cls.setActiveContext(intermediateContext);

      lastContext = cls.createContext();
      cls.setActiveContext(lastContext);
    });

    expect(intermediateContext.suppressTracing).to.equal(true);
    expect(lastContext.suppressTracing).to.equal(true);
  });
});
