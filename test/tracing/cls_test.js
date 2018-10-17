/* eslint-env mocha */

'use strict';

var proxyquire = require('proxyquire');
var expect = require('chai').expect;

describe('tracing/cls', function() {
  var cls;

  beforeEach(function() {
    // reload to clear vars
    cls = proxyquire('../../src/tracing/cls', {});
  });

  it('must not have an active context initially', function() {
    expect(cls.getCurrentSpan()).to.equal(undefined);
  });

  it('must initialize a new valid span', function() {
    cls.ns.run(function() {
      var newSpan = cls.startSpan('cls-test-run', cls.EXIT);
      expect(newSpan).to.be.a('Object');
      expect(newSpan).to.have.property('t');
      expect(newSpan).to.have.property('s');
      expect(newSpan).to.have.property('f');
      expect(newSpan).to.have.property('k');
      expect(newSpan.k).to.equal(cls.EXIT);
      expect(newSpan).to.have.property('async');
      expect(newSpan.async).to.equal(false);
      expect(newSpan).to.have.property('error');
      expect(newSpan.error).to.equal(false);
      expect(newSpan).to.have.property('ec');
      expect(newSpan.ec).to.equal(0);
      expect(newSpan).to.have.property('ts');
      expect(newSpan).to.have.property('d');
      expect(newSpan.d).to.equal(0);
      expect(newSpan).to.have.property('n');
      expect(newSpan.n).to.equal('cls-test-run');
      expect(newSpan).to.have.property('stack');
      expect(newSpan).to.have.property('data');
    });
  });

  it('new spans must inherit from current span IDs', function() {
    var parentSpan;
    var newSpan;

    cls.ns.run(function() {
      parentSpan = cls.startSpan('Mr-Brady', cls.ENTRY);
      newSpan = cls.startSpan('Peter-Brady', cls.EXIT);
    });
    expect(newSpan.t).to.equal(parentSpan.t);
    expect(newSpan.p).to.equal(parentSpan.s);
  });

  it('must pass trace suppression configuration across spans', function() {
    cls.ns.run(function() {
      cls.setTracingLevel('0');
      expect(cls.tracingSuppressed()).to.equal(true);
      cls.startSpan('Antonio-Andolini', cls.ENTRY);
      expect(cls.tracingSuppressed()).to.equal(true);
      cls.startSpan('Vito-Corleone', cls.EXIT);
      expect(cls.tracingSuppressed()).to.equal(true);
      cls.startSpan('Michael-Corleone', cls.EXIT);
      expect(cls.tracingSuppressed()).to.equal(true);

      cls.ns.run(function() {
        cls.setTracingLevel('1');
        expect(cls.tracingSuppressed()).to.equal(false);
        cls.startSpan('Antonio-Andolini', cls.EXIT);
        expect(cls.tracingSuppressed()).to.equal(false);
        cls.startSpan('Vito-Corleone', cls.EXIT);
        expect(cls.tracingSuppressed()).to.equal(false);
        cls.startSpan('Michael-Corleone', cls.EXIT);
        expect(cls.tracingSuppressed()).to.equal(false);

        cls.ns.run(function() {
          cls.setTracingLevel('0');
          expect(cls.tracingSuppressed()).to.equal(true);
          cls.startSpan('Antonio-Andolini', cls.EXIT);
          expect(cls.tracingSuppressed()).to.equal(true);
          cls.startSpan('Vito-Corleone', cls.EXIT);
          expect(cls.tracingSuppressed()).to.equal(true);
          cls.startSpan('Michael-Corleone', cls.EXIT);
          expect(cls.tracingSuppressed()).to.equal(true);

          cls.ns.run(function() {
            expect(cls.tracingSuppressed()).to.equal(true);
            cls.startSpan('Antonio-Andolini', cls.EXIT);
            expect(cls.tracingSuppressed()).to.equal(true);
            cls.startSpan('Vito-Corleone', cls.EXIT);
            expect(cls.tracingSuppressed()).to.equal(true);
            cls.startSpan('Michael-Corleone', cls.EXIT);
            expect(cls.tracingSuppressed()).to.equal(true);
          });
        });
      });
    });
  });

  it('new spans must have direction set', function() {
    var entrySpan;
    var exitSpan;
    var localSpan;

    cls.ns.run(function() {
      entrySpan = cls.startSpan('node.http.server', cls.ENTRY);
      exitSpan = cls.startSpan('mongo', cls.EXIT);
      localSpan = cls.startSpan('myCustom', cls.INTERMEDIATE);
    });

    expect(entrySpan.k).to.equal(cls.ENTRY);
    expect(cls.isEntrySpan(entrySpan)).to.equal(true);
    expect(cls.isExitSpan(entrySpan)).to.equal(false);
    expect(cls.isLocalSpan(entrySpan)).to.equal(false);

    expect(exitSpan.k).to.equal(cls.EXIT);
    expect(cls.isEntrySpan(exitSpan)).to.equal(false);
    expect(cls.isExitSpan(exitSpan)).to.equal(true);
    expect(cls.isLocalSpan(exitSpan)).to.equal(false);

    expect(localSpan.k).to.equal(cls.INTERMEDIATE);
    expect(cls.isEntrySpan(localSpan)).to.equal(false);
    expect(cls.isExitSpan(localSpan)).to.equal(false);
    expect(cls.isLocalSpan(localSpan)).to.equal(true);
  });

  it('must clean up span data from contexts once the span is transmitted', function() {
    cls.ns.run(function(context) {
      expect(context[cls.currentRootSpanKey]).to.equal(undefined);
      expect(context[cls.currentSpanKey]).to.equal(undefined);

      var span = cls.startSpan('node.http.server', cls.ENTRY);
      expect(context[cls.currentRootSpanKey]).to.equal(span);
      expect(context[cls.currentSpanKey]).to.equal(span);

      span.cleanup();
      expect(context[cls.currentRootSpanKey]).to.equal(undefined);
      expect(context[cls.currentSpanKey]).to.equal(undefined);
    });
  });
});
