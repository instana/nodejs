/* eslint-env mocha */

'use strict';

const proxyquire = require('proxyquire');
const expect = require('chai').expect;

const constants = require('../../src/tracing/constants');

describe('tracing/cls', () => {
  let cls;

  beforeEach(() => {
    // reload to clear vars
    cls = proxyquire('../../src/tracing/cls', {});
    cls.init();
  });

  it('must not have an active context initially', () => {
    expect(cls.getCurrentSpan()).to.equal(undefined);
  });

  it('must initialize a new valid span', () => {
    cls.ns.run(() => {
      const newSpan = cls.startSpan('cls-test-run', constants.EXIT);
      expect(newSpan).to.be.a('Object');
      expect(newSpan).to.have.property('t');
      expect(newSpan).to.have.property('s');
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

  it('must not set span.f without process identity provider', () => {
    cls.ns.run(() => {
      const newSpan = cls.startSpan('cls-test-run', constants.EXIT);
      expect(newSpan).to.not.have.property('f');
    });
  });

  it('must not set span.f if process identity provider does not support getFrom', () => {
    cls.init({});
    cls.ns.run(() => {
      const newSpan = cls.startSpan('cls-test-run', constants.EXIT);
      expect(newSpan).to.not.have.property('f');
    });
  });

  it('must use process identity provider', () => {
    cls.init({
      getFrom: function() {
        return {
          e: String(process.pid),
          h: undefined
        };
      }
    });
    cls.ns.run(() => {
      const newSpan = cls.startSpan('cls-test-run', constants.EXIT);
      expect(newSpan.f).to.deep.equal({
        e: String(process.pid),
        h: undefined
      });
    });
  });

  it('new spans must inherit from current span IDs', () => {
    let parentSpan;
    let newSpan;

    cls.ns.run(() => {
      parentSpan = cls.startSpan('Mr-Brady', constants.ENTRY);
      newSpan = cls.startSpan('Peter-Brady', constants.EXIT);
    });
    expect(newSpan.t).to.equal(parentSpan.t);
    expect(newSpan.p).to.equal(parentSpan.s);
  });

  it('must pass trace suppression configuration across spans', () => {
    cls.ns.run(() => {
      cls.setTracingLevel('0');
      expect(cls.tracingSuppressed()).to.equal(true);
      cls.startSpan('Antonio-Andolini', constants.ENTRY);
      expect(cls.tracingSuppressed()).to.equal(true);
      cls.startSpan('Vito-Corleone', constants.EXIT);
      expect(cls.tracingSuppressed()).to.equal(true);
      cls.startSpan('Michael-Corleone', constants.EXIT);
      expect(cls.tracingSuppressed()).to.equal(true);

      cls.ns.run(() => {
        cls.setTracingLevel('1');
        expect(cls.tracingSuppressed()).to.equal(false);
        cls.startSpan('Antonio-Andolini', constants.EXIT);
        expect(cls.tracingSuppressed()).to.equal(false);
        cls.startSpan('Vito-Corleone', constants.EXIT);
        expect(cls.tracingSuppressed()).to.equal(false);
        cls.startSpan('Michael-Corleone', constants.EXIT);
        expect(cls.tracingSuppressed()).to.equal(false);

        cls.ns.run(() => {
          cls.setTracingLevel('0');
          expect(cls.tracingSuppressed()).to.equal(true);
          cls.startSpan('Antonio-Andolini', constants.EXIT);
          expect(cls.tracingSuppressed()).to.equal(true);
          cls.startSpan('Vito-Corleone', constants.EXIT);
          expect(cls.tracingSuppressed()).to.equal(true);
          cls.startSpan('Michael-Corleone', constants.EXIT);
          expect(cls.tracingSuppressed()).to.equal(true);

          cls.ns.run(() => {
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

  it('new spans must have direction set', () => {
    let entrySpan;
    let exitSpan;
    let intermediateSpan;

    cls.ns.run(() => {
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

  it('must clean up span data from contexts once the span has been transmitted', () => {
    cls.ns.run(context => {
      expect(context[cls.currentRootSpanKey]).to.equal(undefined);
      expect(context[cls.currentSpanKey]).to.equal(undefined);

      const span = cls.startSpan('node.http.server', constants.ENTRY);
      expect(context[cls.currentRootSpanKey]).to.equal(span);
      expect(context[cls.currentSpanKey]).to.equal(span);

      span.cleanup();

      expect(context[cls.currentRootSpanKey]).to.equal(undefined);
      expect(context[cls.currentSpanKey]).to.equal(undefined);
    });
  });

  it('must store reduced backup of span data on cleanup', () => {
    cls.ns.run(context => {
      expect(context[cls.currentRootSpanKey]).to.equal(undefined);
      expect(context[cls.currentSpanKey]).to.equal(undefined);

      const span = cls.startSpan('node.http.server', constants.ENTRY);
      span.data = { much: 'data' };
      span.stack = ['a', 'b', 'c'];
      expect(context[cls.currentRootSpanKey]).to.equal(span);
      expect(context[cls.currentSpanKey]).to.equal(span);

      span.cleanup();

      const reducedSpan = context[cls.reducedSpanKey];

      expect(Object.keys(reducedSpan)).to.have.lengthOf(5);
      expect(reducedSpan.n).to.equal(span.n);
      expect(reducedSpan.t).to.equal(span.t);
      expect(reducedSpan.s).to.equal(span.s);
      expect(reducedSpan.p).to.equal(span.p);
      expect(reducedSpan.k).to.equal(span.k);
    });
  });
});
