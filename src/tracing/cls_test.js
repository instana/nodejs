/* eslint-env mocha */

'use strict';

var proxyquire = require('proxyquire');
var expect = require('chai').expect;

describe('tracing/cls', function() {
  var cls;

  beforeEach(function() {
    // reload to clear vars
    cls = proxyquire('./cls', {});
  });

  it('must not have an active context initially', function() {
    expect(cls.getCurrentSpan()).to.equal(undefined);
  });

  it('must initialize a new valid span', function() {
    cls.ns.run(function() {
      var newSpan = cls.startSpan('cls-test-run');
      expect(newSpan).to.be.a('Object');
      expect(newSpan).to.have.property('t');
      expect(newSpan).to.have.property('s');
      expect(newSpan).to.have.property('f');
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
      parentSpan = cls.startSpan('Mr-Brady');
      newSpan = cls.startSpan('Peter-Brady');
    });
    expect(newSpan.t).to.equal(parentSpan.t);
    expect(newSpan.p).to.equal(parentSpan.s);
  });

  it('must pass trace suppression configuration across spans', function() {
    cls.ns.run(function() {
      cls.setTracingLevel('0');
      expect(cls.tracingSuppressed()).to.equal(true);
      cls.startSpan('Antonio-Andolini');
      expect(cls.tracingSuppressed()).to.equal(true);
      cls.startSpan('Vito-Corleone');
      expect(cls.tracingSuppressed()).to.equal(true);
      cls.startSpan('Michael-Corleone');
      expect(cls.tracingSuppressed()).to.equal(true);

      cls.ns.run(function() {
        cls.setTracingLevel('1');
        expect(cls.tracingSuppressed()).to.equal(false);
        cls.startSpan('Antonio-Andolini');
        expect(cls.tracingSuppressed()).to.equal(false);
        cls.startSpan('Vito-Corleone');
        expect(cls.tracingSuppressed()).to.equal(false);
        cls.startSpan('Michael-Corleone');
        expect(cls.tracingSuppressed()).to.equal(false);

        cls.ns.run(function() {
          cls.setTracingLevel('0');
          expect(cls.tracingSuppressed()).to.equal(true);
          cls.startSpan('Antonio-Andolini');
          expect(cls.tracingSuppressed()).to.equal(true);
          cls.startSpan('Vito-Corleone');
          expect(cls.tracingSuppressed()).to.equal(true);
          cls.startSpan('Michael-Corleone');
          expect(cls.tracingSuppressed()).to.equal(true);

          cls.ns.run(function() {
            expect(cls.tracingSuppressed()).to.equal(true);
            cls.startSpan('Antonio-Andolini');
            expect(cls.tracingSuppressed()).to.equal(true);
            cls.startSpan('Vito-Corleone');
            expect(cls.tracingSuppressed()).to.equal(true);
            cls.startSpan('Michael-Corleone');
            expect(cls.tracingSuppressed()).to.equal(true);
          });
        });
      });
    });
  });
});
