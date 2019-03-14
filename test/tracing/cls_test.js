/* eslint-env mocha */

'use strict';

var proxyquire = require('proxyquire');
var expect = require('chai').expect;

var constants = require('../../src/tracing/constants');

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
      var newSpan = cls.startSpan('cls-test-run', constants.EXIT);
      expect(newSpan).to.be.a('Object');
      expect(newSpan).to.have.property('t');
      expect(newSpan).to.have.property('s');
      expect(newSpan).to.have.property('f');
      expect(newSpan).to.have.property('k');
      expect(newSpan.k).to.equal(constants.EXIT);
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
      parentSpan = cls.startSpan('Mr-Brady', constants.ENTRY);
      newSpan = cls.startSpan('Peter-Brady', constants.EXIT);
    });
    expect(newSpan.t).to.equal(parentSpan.t);
    expect(newSpan.p).to.equal(parentSpan.s);
  });

  it('must pass trace suppression configuration across spans', function() {
    cls.ns.run(function() {
      cls.setTracingLevel('0');
      expect(cls.tracingSuppressed()).to.equal(true);
      cls.startSpan('Antonio-Andolini', constants.ENTRY);
      expect(cls.tracingSuppressed()).to.equal(true);
      cls.startSpan('Vito-Corleone', constants.EXIT);
      expect(cls.tracingSuppressed()).to.equal(true);
      cls.startSpan('Michael-Corleone', constants.EXIT);
      expect(cls.tracingSuppressed()).to.equal(true);

      cls.ns.run(function() {
        cls.setTracingLevel('1');
        expect(cls.tracingSuppressed()).to.equal(false);
        cls.startSpan('Antonio-Andolini', constants.EXIT);
        expect(cls.tracingSuppressed()).to.equal(false);
        cls.startSpan('Vito-Corleone', constants.EXIT);
        expect(cls.tracingSuppressed()).to.equal(false);
        cls.startSpan('Michael-Corleone', constants.EXIT);
        expect(cls.tracingSuppressed()).to.equal(false);

        cls.ns.run(function() {
          cls.setTracingLevel('0');
          expect(cls.tracingSuppressed()).to.equal(true);
          cls.startSpan('Antonio-Andolini', constants.EXIT);
          expect(cls.tracingSuppressed()).to.equal(true);
          cls.startSpan('Vito-Corleone', constants.EXIT);
          expect(cls.tracingSuppressed()).to.equal(true);
          cls.startSpan('Michael-Corleone', constants.EXIT);
          expect(cls.tracingSuppressed()).to.equal(true);

          cls.ns.run(function() {
            expect(cls.tracingSuppressed()).to.equal(true);
            cls.startSpan('Antonio-Andolini', constants.EXIT);
            expect(cls.tracingSuppressed()).to.equal(true);
            cls.startSpan('Vito-Corleone', constants.EXIT);
            expect(cls.tracingSuppressed()).to.equal(true);
            cls.startSpan('Michael-Corleone', constants.EXIT);
            expect(cls.tracingSuppressed()).to.equal(true);
          });
        });
      });
    });
  });

  it('new spans must have direction set', function() {
    var entrySpan;
    var exitSpan;
    var intermediateSpan;

    cls.ns.run(function() {
      entrySpan = cls.startSpan('node.http.server', constants.ENTRY);
      exitSpan = cls.startSpan('mongo', constants.EXIT);
      intermediateSpan = cls.startSpan('intermediate', constants.INTERMEDIATE);
    });

    expect(entrySpan.k).to.equal(constants.ENTRY);
    expect(constants.isEntrySpan(entrySpan)).to.equal(true);
    expect(constants.isExitSpan(entrySpan)).to.equal(false);
    expect(constants.isIntermediateSpan(entrySpan)).to.equal(false);

    expect(exitSpan.k).to.equal(constants.EXIT);
    expect(constants.isEntrySpan(exitSpan)).to.equal(false);
    expect(constants.isExitSpan(exitSpan)).to.equal(true);
    expect(constants.isIntermediateSpan(exitSpan)).to.equal(false);

    expect(intermediateSpan.k).to.equal(constants.INTERMEDIATE);
    expect(constants.isEntrySpan(intermediateSpan)).to.equal(false);
    expect(constants.isExitSpan(intermediateSpan)).to.equal(false);
    expect(constants.isIntermediateSpan(intermediateSpan)).to.equal(true);
  });

  it('must clean up span data from contexts once the span is transmitted', function() {
    cls.ns.run(function(context) {
      expect(context[cls.currentRootSpanKey]).to.equal(undefined);
      expect(context[cls.currentSpanKey]).to.equal(undefined);

      var span = cls.startSpan('node.http.server', constants.ENTRY);
      expect(context[cls.currentRootSpanKey]).to.equal(span);
      expect(context[cls.currentSpanKey]).to.equal(span);

      span.cleanup();
      expect(context[cls.currentRootSpanKey]).to.equal(undefined);
      expect(context[cls.currentSpanKey]).to.equal(undefined);
    });
  });
});
